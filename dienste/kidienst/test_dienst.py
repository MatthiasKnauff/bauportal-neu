"""Test des KI-Ausgangs gegen nachgestellte Anbieter: Jede der vier Arten bekommt die Anfrage in ihrer Form."""
import json
import os

os.environ["DIENST_SCHLUESSEL"] = "test"
import httpx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import dienst  # noqa: E402

gesehen = []


def anbieter(req: httpx.Request) -> httpx.Response:
    body = json.loads(req.content) if req.content else None
    gesehen.append((req.method, str(req.url), dict(req.headers), body))
    u = req.url
    if u.host == "ollama.buero" and u.path == "/api/chat":
        return httpx.Response(200, json={"message": {"content": "Ollama: " + body["messages"][1]["content"]}, "prompt_eval_count": 12, "eval_count": 5})
    if u.host == "ollama.buero" and u.path == "/api/tags":
        return httpx.Response(200, json={"models": [{"name": "llama3.3:latest"}, {"name": "gemma3:12b"}]})
    if u.host == "api.anthropic.com" and u.path == "/v1/messages":
        if req.headers.get("x-api-key") != "sk-ant":
            return httpx.Response(401, json={"error": {"message": "invalid x-api-key"}})
        return httpx.Response(200, json={"content": [{"type": "text", "text": "Claude: " + body["messages"][0]["content"]}], "usage": {"input_tokens": 20, "output_tokens": 7}})
    if u.host == "api.anthropic.com" and u.path == "/v1/models":
        return httpx.Response(200, json={"data": [{"id": "claude-sonnet-5-5"}, {"id": "claude-haiku-5-5"}]})
    if u.host == "api.openai.com" and u.path == "/v1/chat/completions":
        if body["model"] == "gibt-es-nicht":
            return httpx.Response(404, json={"error": {"message": "model not found"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": "OpenAI: " + body["messages"][1]["content"]}}], "usage": {"prompt_tokens": 9, "completion_tokens": 3}})
    if u.host == "generativelanguage.googleapis.com" and u.path.endswith(":generateContent"):
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "nachgedacht", "thought": True}, {"text": "Gemini: " + body["contents"][0]["parts"][0]["text"]}]}}],
                                         "usageMetadata": {"promptTokenCount": 8, "candidatesTokenCount": 4}})
    if u.host == "generativelanguage.googleapis.com" and u.path == "/v1beta/models":
        return httpx.Response(200, json={"models": [{"name": "models/gemini-flash", "supportedGenerationMethods": ["generateContent"]}, {"name": "models/einbettung", "supportedGenerationMethods": ["embedContent"]}]})
    return httpx.Response(500, json={"error": "unerwartet"})


dienst.transport = httpx.MockTransport(anbieter)
c = TestClient(dienst.app)
K = {"X-Schluessel": "test"}
frage = {"anweisung": "Formuliere aus.", "text": "Bodenplatte betoniert"}

assert c.post("/frage", json={"art": "ollama", **frage}).status_code == 403, "ohne Schlüssel kein Zugriff"
r = c.post("/frage", json={"art": "ollama", "adresse": "http://ollama.buero:11434/", "modell": "llama3.3", **frage}, headers=K)
assert r.status_code == 200 and r.json() == {"text": "Ollama: Bodenplatte betoniert", "ein": 12, "aus": 5}, r.text
assert gesehen[-1][3]["messages"][0] == {"role": "system", "content": "Formuliere aus."} and gesehen[-1][3]["stream"] is False
assert c.post("/modelle", json={"art": "ollama", "adresse": "http://ollama.buero:11434"}, headers=K).json() == {"modelle": ["gemma3:12b", "llama3.3:latest"]}
assert "Adresse" in c.post("/frage", json={"art": "ollama", "modell": "x", **frage}, headers=K).json()["fehler"]

r = c.post("/frage", json={"art": "claude", "schluessel": "sk-ant", "modell": "claude-haiku-5-5", **frage}, headers=K)
assert r.json() == {"text": "Claude: Bodenplatte betoniert", "ein": 20, "aus": 7}, r.text
assert gesehen[-1][2]["anthropic-version"] == "2023-06-01" and gesehen[-1][3]["system"] == "Formuliere aus." and gesehen[-1][3]["max_tokens"] == 2000
r = c.post("/frage", json={"art": "claude", "schluessel": "falsch", "modell": "claude-haiku-5-5", **frage}, headers=K)
assert r.status_code == 502 and "lehnt den Zugangsschlüssel ab" in r.json()["fehler"]
assert "kein Zugangsschlüssel" in c.post("/frage", json={"art": "claude", "modell": "m", **frage}, headers=K).json()["fehler"]
assert c.post("/modelle", json={"art": "claude", "schluessel": "sk-ant"}, headers=K).json()["modelle"] == ["claude-haiku-5-5", "claude-sonnet-5-5"]

r = c.post("/frage", json={"art": "openai", "schluessel": "sk-oa", "modell": "modell-a", **frage}, headers=K)
assert r.json()["text"] == "OpenAI: Bodenplatte betoniert" and gesehen[-1][2]["authorization"] == "Bearer sk-oa"
assert "kennt der Anbieter nicht" in c.post("/frage", json={"art": "openai", "schluessel": "sk-oa", "modell": "gibt-es-nicht", **frage}, headers=K).json()["fehler"]

r = c.post("/frage", json={"art": "gemini", "schluessel": "g-key", "modell": "models/gemini-flash", **frage}, headers=K)
assert r.json() == {"text": "Gemini: Bodenplatte betoniert", "ein": 8, "aus": 4}, r.text
assert gesehen[-1][1].endswith("/v1beta/models/gemini-flash:generateContent") and gesehen[-1][2]["x-goog-api-key"] == "g-key"
assert c.post("/modelle", json={"art": "gemini", "schluessel": "g-key"}, headers=K).json() == {"modelle": ["gemini-flash"]}
assert "noch kein Modell" in c.post("/frage", json={"art": "gemini", "schluessel": "g", **frage}, headers=K).json()["fehler"]
print("KI-Ausgang: alle Prüfungen bestanden")
