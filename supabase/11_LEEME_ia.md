# Revisión automática con IA · cómo activarla

Son 3 pasos. Hasta que no los hagas, la app sigue funcionando igual que antes (todo capítulo nuevo queda pendiente para moderación).

## Paso 1 · SQL
En Supabase → **SQL Editor** → consulta nueva → pega todo `11_ia_moderacion.sql` → **Run**.

## Paso 2 · Clave de OpenAI (la revisión de contenido es gratuita)
1. Entra a https://platform.openai.com y crea una cuenta.
2. Ve a **API keys** → *Create new secret key* → copia la clave (empieza con `sk-`).
   Guárdala solo para ti. **No la pegues en el chat ni en GitHub.**
3. OpenAI puede pedirte verificar la cuenta. Revisa en su página de precios que "Moderation" siga siendo gratis.

## Paso 3 · La función en Supabase
1. En Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre exacto: `moderate-chapter`.
3. Borra el código de ejemplo y pega todo `functions/moderate-chapter/index.ts`.
4. Deja activada la opción **Verify JWT** (viene así por defecto). **Deploy**.
5. En **Edge Functions → Secrets** agrega:
   - `OPENAI_API_KEY` = tu clave `sk-...`
   - (opcional) `AI_MODE` = `auto` (por defecto: lo limpio se publica solo) · `advisory` (la IA solo avisa, moderación aprueba todo) · `off`

## Cómo se comporta
- Libro **sin** marca +18: cualquier contenido sugerente queda oculto y va a moderación.
- Libro **con** marca +18: solo se marca lo prohibido o muy explícito.
- Posible sexualización de menores: **siempre** va a moderación, tenga o no marca +18.
- Si la IA falla, no hay clave o la función no está desplegada: el capítulo simplemente queda pendiente para moderación.
- Moderación ve en cada capítulo marcado la razón, el porcentaje y un fragmento.
- Los umbrales se ajustan en las listas `T_GENERAL` y `T_MATURE` al inicio de `index.ts`.

## Para probar con calma
Pon `AI_MODE = advisory`: la IA revisa y deja su nota, pero nada se publica solo. Cuando veas que acierta, cámbialo a `auto`.
