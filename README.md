# bauportal-neu



## So kommt eine Änderung auf die Server

1. **Push auf `main`** – GitHub baut das Image. Die Pipeline schreibt die fertige Compose-Datei in den Zweig
   `deploy-test`, Portainer bemerkt das (spätestens nach einer Minute) und aktualisiert den **Testserver**.
2. **Testserver ansehen** – oben steht „Testserver – wird vX.Y.Z“.
3. **Release freigeben** – [neues Release anlegen](https://github.com/MatthiasKnauff/bauportal-neu/releases/new?target=main).
   Die Pipeline baut das Image mit der Versionsnummer, schreibt es in `deploy-prod`, und Portainer
   aktualisiert den **Produktivserver**.

| | Server |
|---|---|
| Test | docker2 · Port 8300 · https://bauportal-test.knauff.info · Volume `bauportal-neu-test` |
| Produktiv | docker3 · Port 8300 · https://bauportal.knauff.info · Volume `bauportal-neu-prod` |

## Aufbau

- `deploy/compose.template.yml` – Compose-Datei für beide Server (Ports und Variablen kommen aus Portainer)
- `.github/workflows/deploy.yml` – Pipeline
- Zweige `deploy-test` / `deploy-prod` – werden von der Pipeline geschrieben, nicht von Hand ändern

Eingerichtet mit der Deploy-Automatik.
