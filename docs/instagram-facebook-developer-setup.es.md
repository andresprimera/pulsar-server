# Configuración del canal Instagram en Facebook Developer (Meta)

Instrucciones para configurar una app en Meta (Facebook Developer) y conectar tu cuenta de Instagram con el servidor Pulsar. Se asume que tu cuenta de Meta está verificada y que aún no tienes apps ni desarrolladores creados.

---

## 1. Acceder a Meta for Developers

1. Entra en [developers.facebook.com](https://developers.facebook.com).
2. Inicia sesión con tu cuenta de Facebook (la misma que usas para Instagram Business/Creator).
3. Acepta los términos si es la primera vez que usas la plataforma de desarrolladores.

---

## 2. Crear una app

1. En el menú superior, haz clic en **Mis aplicaciones**.
2. Clic en **Crear aplicación**.
3. Elige el tipo **Empresa** (Business) y **Siguiente**.
4. Selecciona **Empresa** como categoría (o la que mejor encaje) y **Siguiente**.
5. Pon un nombre a la app (por ejemplo: "Pulsar Instagram") y un contacto de email. Clic en **Crear aplicación**.
6. Completa el flujo inicial si te lo pide (por ejemplo, seleccionar el producto más adelante).

---

## 3. Añadir el producto Instagram

1. En el panel de tu app, en **Añadir productos**, busca **Instagram**.
2. Clic en **Configurar** en la tarjeta de **Instagram Graph API** (o **Instagram**, según la interfaz).
3. Sigue los pasos que Meta indique para activar el producto.

**Requisito:** La cuenta de Instagram que quieras conectar debe ser **Cuenta profesional** (Creatora o Empresa) y, si Meta lo pide, vinculada a una **Página de Facebook**.

---

## 4. Configurar el webhook

El servidor Pulsar recibe los mensajes de Instagram en un webhook. Meta debe conocer la URL y un token de verificación.

1. En el menú lateral de la app, entra en **Instagram** → **Configuración básica** (o **Webhooks** / **Configuración**).
2. Localiza la sección **Webhooks** (a veces dentro de "Instagram" o "Página").
3. Clic en **Añadir o editar suscripciones** o **Configurar** en Webhooks.
4. Elige el objeto **Instagram** (o **Página**, si tu webhook está bajo Pages; en ese caso la URL debe ser la misma y el servidor soporta el payload de messaging).

Configura:

| Campo | Valor |
|--------|--------|
| **URL de devolución de llamada (Callback URL)** | `https://TU_DOMINIO_PUBLICO/instagram/webhook` |
| **Token de verificación (Verify Token)** | El mismo valor que uses en la variable de entorno `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` en el servidor (por ejemplo, una cadena secreta que tú elijas). |

5. Guarda. Meta enviará una petición `GET` a esa URL con `hub.mode=subscribe`, `hub.verify_token=...` y `hub.challenge=...`. El servidor Pulsar responderá con el `challenge` si el token coincide; así Meta confirmará la suscripción.
6. En **Campos a suscribir** (o **Webhook fields**), activa al menos:
   - **messages** (para recibir mensajes entrantes y permitir respuestas dentro de la ventana permitida).
   - Si aparece **messaging_postbacks** o **message_echoes**, actívalos solo si los vas a usar.

**Importante:** La URL del webhook debe ser HTTPS y accesible desde internet. En desarrollo local puedes usar un túnel (por ejemplo ngrok) y poner esa URL temporal como Callback URL.

---

## 5. Obtener credenciales de la app

1. En el menú lateral: **Configuración** → **Básica**.
2. Anota:
   - **ID de la aplicación (App ID)**.
   - **Clave secreta de la aplicación (App Secret)** → clic en **Mostrar** y cópiala.

En el servidor Pulsar configura (por ejemplo en `.env`):

- `INSTAGRAM_APP_SECRET` = clave secreta de la aplicación (App Secret).

Opcional (el servidor tiene valores por defecto):

- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` = el mismo **Token de verificación** que pusiste en el webhook de Meta.
- `INSTAGRAM_API_HOST` = `https://graph.facebook.com` (por defecto).
- `INSTAGRAM_API_VERSION` = `v24.0` (por defecto).

---

## 6. Conectar tu cuenta de Instagram (y página si aplica)

1. En **Instagram** → **Configuración básica** (o **Herramientas de la API de Instagram**), busca la sección donde se conectan cuentas o páginas.
2. Si te pide una **Página de Facebook**:
   - Conecta o crea una Página de Facebook.
   - Vincula tu cuenta de Instagram profesional a esa página (desde la app de Instagram o desde Configuración de la Página).
3. En la app de Meta, **Añade** la cuenta de Instagram (o la página que tiene vinculada la cuenta de Instagram). Acepta los permisos que solicite.

---

## 7. Permisos de la app

1. Ve a **Configuración** → **Básica** y revisa **Permisos y características** (o **App Review** si aplica).
2. Para mensajes entrantes y respuestas, suelen ser necesarios permisos como:
   - **instagram_manage_messages** (gestión de mensajes de Instagram).
   - **pages_messaging** (si el flujo pasa por una página).
   - **instagram_basic** (si lo pide la API).

En modo desarrollo, estos permisos suelen estar disponibles para roles de la app (administradores, probadores). Para uso en producción, puede ser necesario pasar por **App Review** de Meta.

---

## 8. Obtener el Access Token y el ID de la cuenta de Instagram

Para cada cuenta de Instagram que quieras usar en Pulsar necesitas:

- **instagramAccountId**: ID numérico de la cuenta de Instagram (cuenta profesional vinculada a la app).
- **accessToken**: token de acceso con permisos de mensajería.

Opciones habituales:

**Opción A – Generador de tokens en la app**

1. En la app de Meta: **Herramientas** → **Token de acceso** (o **Instagram** → **Generar token**).
2. Elige la **Página** conectada (si aplica) o la cuenta de Instagram.
3. Marca los permisos: `instagram_manage_messages`, `instagram_basic`, y si aparece `pages_messaging` para la página vinculada.
4. Genera el token y cópialo (guárdalo en un lugar seguro; no se vuelve a mostrar completo).

**Opción B – Graph API Explorer**

1. Ve a [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer).
2. Elige tu app en el desplegable.
3. En "Permisos", añade `instagram_manage_messages`, `instagram_basic` y los que pida tu flujo.
4. Genera el token y cópialo.

**Obtener el ID de la cuenta de Instagram (instagramAccountId)**

1. En Graph API Explorer (o con una petición GET):  
   `https://graph.facebook.com/v24.0/me/accounts?fields=instagram_business_account&access_token=TU_PAGE_ACCESS_TOKEN`
2. En la respuesta, cada página tiene un objeto `instagram_business_account` con un campo `id`. Ese `id` es el **instagramAccountId** que usa Pulsar.

Si usas solo Instagram (sin página), en la documentación de Meta se indica cómo obtener el ID de la cuenta de Instagram asociada a tu app; ese mismo ID es el **instagramAccountId**.

---

## 9. Configurar el servidor Pulsar

En el `.env` del servidor (o en el entorno de ejecución):

```env
# Obligatorio para validar la firma del webhook (recomendado en producción)
INSTAGRAM_APP_SECRET=tu_app_secret_de_meta

# Debe coincidir con el "Token de verificación" configurado en el webhook de Meta
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=el_mismo_verify_token_que_en_meta
```

La URL que Meta debe usar es:

- **GET y POST:** `https://TU_DOMINIO/instagram/webhook`

Asegúrate de que el servidor esté levantado y que esa ruta sea accesible por internet (y que el token de verificación coincida al dar de alta el webhook).

---

## 10. Registrar el canal en Pulsar (onboarding / cliente)

En tu flujo de onboarding o al dar de alta un canal Instagram en la app, necesitas guardar por cada cuenta de Instagram:

- **instagramAccountId**: el ID numérico de la cuenta de Instagram (obtenido en el paso 8).
- **accessToken**: el token de acceso con permisos de mensajería (obtenido en el paso 8).

Estos valores se guardan en la configuración del canal (por ejemplo en las credenciales del agente contratado). El servidor los usa para enrutar los mensajes entrantes y para enviar respuestas por la API de Instagram.

---

## Resumen de comprobaciones

| Qué | Dónde |
|-----|--------|
| App creada en Meta | developers.facebook.com → Mis aplicaciones |
| Producto Instagram (Graph API) añadido | Panel de la app → Instagram |
| Webhook URL | `https://TU_DOMINIO/instagram/webhook` |
| Verify Token | Igual que `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` en el servidor |
| App Secret | En `.env` como `INSTAGRAM_APP_SECRET` |
| instagramAccountId + accessToken | En la configuración del canal en Pulsar (onboarding/cliente) |

Si algo falla, revisa que la URL del webhook sea HTTPS, que el token de verificación coincida y que el App Secret esté bien configurado para la validación de la firma `X-Hub-Signature-256`.
