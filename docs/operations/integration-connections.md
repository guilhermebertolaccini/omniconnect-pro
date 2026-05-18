# Integration connections (bridges) — operations

Tenant-scoped rows in `IntegrationConnection` tell the backend **which webhook
secret** validates inbound traffic from CRM / ads / Botify and **which UUID**
browser apps send as `connectionId` on `POST /integrations/bridge/events`.

## Fields (operational)

| Field | Notes |
| --- | --- |
| `tenantId` | Must match the tenant receiving webhooks / JWT emit. |
| `provider` | `crm`, `ads`, or `bot` (aligned with bridge modules). |
| `webhookSecretEncrypted` | **Never plaintext in production.** AES-256-GCM blob from `BridgeSecretCipher` (`v1.<iv>.<tag>.<ct>`). |
| `status` | Use `active` for live traffic. |

## Creating a connection in production

1. **Same `BRIDGE_SECRET_KEY` as the backend** that will decrypt the row (see `BridgeSecretCipher` and `docs/04-security.md`).
2. Generate a **random shared secret** for HMAC (e.g. `openssl rand -hex 32`) for server-to-server webhooks.
3. Encrypt it with the backend cipher so the DB stores ciphertext only:

   ```bash
   cd apps/omniconnect-backend
   BRIDGE_SECRET_KEY=… npx tsx scripts/encrypt-bridge-webhook-secret.ts 'paste-plaintext-secret-here'
   ```

4. Insert the row (Prisma Studio, migration, or SQL), e.g.:

   - `id`: new UUID (this is the **`x-integration-id`** / **`VITE_*_BRIDGE_CONNECTION_ID`**).
   - `tenantId`: target tenant.
   - `provider`: `crm` | `ads` | `bot`.
   - `webhookSecretEncrypted`: output from step 3.
   - `status`: `active`.

5. **Configure emitters**
   - CRM: `VITE_OMNICONNECT_BRIDGE_CONNECTION_ID=<uuid>` (`provider=crm`).
   - SAA: `VITE_OMNICONNECT_ADS_BRIDGE_CONNECTION_ID=<uuid>` (`provider=ads`).
   - Botify microservice: connection id + plaintext secret envs (HMAC from server; see Botify README).

6. **Webhook callers** must send:
   - Header `x-integration-id: <connection id>`.
   - Header `x-signature: <hex HMAC-SHA256(secret, rawBody)>`.
   - Optional `idempotency-key`.

## Rotation

1. Create a **new** `IntegrationConnection` row (new UUID + new random secret, encrypted).
2. Point external systems and `VITE_*` envs to the **new** id (and new secret for HMAC).
3. Deprecate the old row: set `status` to something other than `active` *after* traffic has drained.

There is **no** tenant self-service CRUD for connections yet; use controlled admin/SQL until an API exists.

## Related docs

- `docs/migration/sprint-4-bridge-processors.md` — bridge processors and emit path.
- `apps/omniconnect-backend/src/integration-events/bridge-secret-cipher.ts` — encryption format.
