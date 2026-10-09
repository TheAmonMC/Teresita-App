# Variedades Teresita — catálogo local + WhatsApp

La tienda funciona sin una base de datos de productos.

## Cómo funciona

- Los productos están incluidos en `index.html`.
- Los precios iniciales también están incluidos en `index.html`.
- El panel de administración se abre desde **⚙ Administración**.
- El panel pide una contraseña.
- La tasa y los cambios de precios se guardan en el navegador mediante `localStorage`.
- Cada producto tiene un botón **Pedir por WhatsApp** que abre WhatsApp con el número de Variedades Teresita.
- No se consulta ni se modifica una tabla `products` en Supabase.

## Cambiar la contraseña del administrador

Abre `app.js` y cambia:

`const ADMIN_PASSWORD = "CAMBIA-ESTA-CONTRASEÑA";`

por tu contraseña real antes de publicar.

**Importante:** esta contraseña protege el acceso al panel en la interfaz del navegador. Si necesitas seguridad real de servidor, el panel debe usar autenticación/backend.

## WhatsApp

El botón utiliza el número configurado en `app.js`:

`584127615673`

Es el formato internacional de WhatsApp para el número venezolano `04127615673`.

## Vercel

Sube el contenido de `teresita_web2` a GitHub y conéctalo con Vercel. No necesita build ni Node.js.


## Sincronización global del catálogo

El panel de administración ahora guarda cambios en Supabase para que precios, visibilidad e imágenes sean iguales para todos los visitantes. El navegador ya no es la fuente principal del catálogo.

### Variables de Vercel
Configura estas variables en **Project Settings → Environment Variables**:

- `SUPABASE_URL` = URL de tu proyecto
- `SUPABASE_SERVICE_ROLE_KEY` = Service Role Key de Supabase (**nunca** ponerla en el frontend ni en GitHub)
- `ADMIN_PASSWORD` = `Teresita14` (o la contraseña que quieras)
- `ADMIN_TOKEN_SECRET` = una cadena larga y privada para firmar la sesión del administrador

La clave `SUPABASE_ANON_KEY` sí puede permanecer en el frontend.

### Supabase
Ejecuta nuevamente `supabase.sql` en el SQL Editor para crear/agregar `image_url` en `products`. El sistema crea automáticamente el bucket público `product-images` cuando se sube la primera imagen desde el panel.

### Funcionamiento
- Clientes: leen el catálogo global desde `/api/catalog?action=public`.
- Administrador: inicia sesión en `/api/catalog?action=login`.
- Guardar precio/ocultar/mostrar: se publica inmediatamente en Supabase.
- Imágenes: se comprimen y se suben a Supabase Storage; luego se guarda su URL en el producto.
- `Publicar catálogo`: sirve para subir de una vez el catálogo inicial del proyecto.
- El tutorial de compra aparece una vez por navegador y se puede abrir nuevamente con `?` en la barra superior.
