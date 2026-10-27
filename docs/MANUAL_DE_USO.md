# Manual de uso — Conkreto · Certificados, reajustes CAC y cauciones

Este manual explica, paso a paso y sin dar nada por sabido, cómo se usa el sistema, para qué sirve cada pantalla y qué hace el sistema por detrás con cada dato que cargás.

---

## Índice

1. [Para qué sirve el sistema](#1-para-qué-sirve-el-sistema)
2. [Conceptos que tenés que conocer](#2-conceptos-que-tenés-que-conocer)
3. [Primer ingreso](#3-primer-ingreso)
4. [Cómo está organizada la pantalla](#4-cómo-está-organizada-la-pantalla)
5. [El orden correcto para cargar la información](#5-el-orden-correcto-para-cargar-la-información)
6. [Inicio (centro de control)](#6-inicio-centro-de-control)
7. [Vencimientos (calendario)](#7-vencimientos-calendario)
8. [Clientes](#8-clientes)
9. [Obras](#9-obras)
10. [Órdenes de compra](#10-órdenes-de-compra)
11. [Certificados](#11-certificados)
12. [Índices CAC](#12-índices-cac)
13. [Reajustes CAC](#13-reajustes-cac)
14. [Pagos](#14-pagos)
15. [Retenciones (cauciones)](#15-retenciones-cauciones)
16. [Registrar la finalización de obra, orden o alcance](#16-registrar-la-finalización-de-obra-orden-o-alcance)
17. [Reclamos](#17-reclamos)
18. [Reportes](#18-reportes)
19. [Documentos y adjuntos](#19-documentos-y-adjuntos)
20. [Recordatorios (la campana)](#20-recordatorios-la-campana)
21. [Búsqueda global](#21-búsqueda-global)
22. [Mi perfil y contraseña](#22-mi-perfil-y-contraseña)
23. [Administración (solo administradores)](#23-administración-solo-administradores)
24. [Ejemplo completo de principio a fin](#24-ejemplo-completo-de-principio-a-fin)
25. [Reglas que el sistema siempre respeta](#25-reglas-que-el-sistema-siempre-respeta)
26. [Tabla de estados](#26-tabla-de-estados)
27. [Qué puede hacer cada rol](#27-qué-puede-hacer-cada-rol)
28. [Preguntas frecuentes y problemas comunes](#28-preguntas-frecuentes-y-problemas-comunes)

---

## 1. Para qué sirve el sistema

Conkreto trabaja con órdenes de compra de sus clientes. Sobre cada orden se emiten **certificados de avance** (lo que se ejecutó en un período). Los certificados pueden llevar un **reajuste por índice CAC**, el cliente los **paga** (a veces en partes) y además **retiene un porcentaje como garantía (caución)**, que devuelve recién un tiempo después de terminada la obra.

El sistema sirve para responder, en cualquier momento, preguntas como estas:

- ¿Cuánto contraté con cada cliente, cuánto certifiqué y cuánto me falta certificar de cada rubro?
- ¿Cuánto me deben de certificados facturados y cuánto ya cobré?
- ¿Qué reajustes CAC calculé, cuáles presenté, cuáles me aprobaron y cuáles me pagaron?
- ¿Cuánta plata tengo retenida como caución, cuándo puedo reclamar cada una y cuáles ya vencieron sin que me las devuelvan?
- ¿A quién reclamé, cuándo, qué me respondió y cuándo me prometió pagar?

Todo queda registrado con fecha, usuario y motivo, para poder reconstruir la historia de cada número.

---

## 2. Conceptos que tenés que conocer

| Término | Qué significa en el sistema |
|---|---|
| **Cliente** | La empresa que contrata a Conkreto (razón social, CUIT, contacto). |
| **Obra** | El proyecto físico donde se trabaja. Pertenece a un cliente y puede tener varias órdenes de compra. |
| **Orden de compra (OC)** | El contrato con el cliente para una obra. Define moneda, condiciones de pago, porcentaje y base de la caución, y cuándo se libera. |
| **Rubro** | Cada ítem de la OC: descripción, unidad (m², m³, ml, etc.), cantidad contratada y precio unitario original. |
| **Alcance** | Un conjunto de trabajos dentro de una OC (ej.: "Torre A", "Subsuelos"). Sirve cuando la caución se libera al terminar una parte y no toda la orden. |
| **Certificado** | Documento que mide lo ejecutado en un período: cantidades por rubro × precio, más reajustes, menos caución y otros descuentos. |
| **Importe base** | Cantidad certificada × precio unitario original, sin reajustes. |
| **Índice CAC** | Valor mensual publicado por la Cámara Argentina de la Construcción para una serie. Se carga a mano. |
| **Reajuste CAC** | Actualización del importe base por la variación del índice. Puede ser por **variación simple** (índice nuevo ÷ índice base) o **contractual** (importe que valida el contrato, por ejemplo con una fórmula polinómica). |
| **Coeficiente** | Índice actualizado ÷ índice base. Ejemplo: 120 ÷ 100 = 1,2. |
| **Importe bruto** | Base + reajuste CAC + otros conceptos a sumar. |
| **Retención de caución (caución)** | Porcentaje (normalmente 5 %) que el cliente descuenta de cada certificado como garantía y devuelve después. |
| **Base de retención** | Sobre qué importe se calcula ese porcentaje: solo la base, base + CAC aprobado, el bruto total, o una combinación personalizada. Lo define cada OC. |
| **Neto exigible / neto a cobrar** | Bruto − caución − otros descuentos. Es lo que el cliente tiene que pagar por ese certificado. |
| **Hito de finalización** | La fecha **real** en que terminó la obra, la orden o un alcance. Es lo que inicia el plazo para que te devuelvan la caución. |
| **Plazo de liberación** | Días corridos desde el hito hasta que la caución se puede reclamar (por defecto 180). |
| **Pago** | Dinero efectivamente recibido (fecha, importe, medio, referencia). |
| **Aplicación de un pago** | A qué se destina ese dinero: al neto de uno o varios certificados, a la devolución de una caución, o a otro concepto. |
| **Reclamo** | Gestión hecha ante el cliente para que devuelva una o varias cauciones. Reclamar **no** es cobrar. |
| **Anular** | Dejar un registro sin efecto **sin borrarlo**. Sigue visible, con el motivo, pero deja de sumar en los saldos. |

---

## 3. Primer ingreso

### 3.1. Entrar al sistema

1. Abrí la dirección que te pasó el administrador (en el entorno local: `http://localhost:5173`). Funciona en computadora, tablet y celular, con cualquier navegador actualizado.
2. Escribí tu **correo electrónico** y tu **contraseña**. No importa si usás mayúsculas o minúsculas en el correo.
3. Tocá **Ingresar**.

No existe una pantalla para registrarse. **Las cuentas las crea un administrador** desde *Administración → Usuarios*. Si no tenés usuario, pedíselo.

### 3.2. Si te equivocás de contraseña

Después de varios intentos fallidos seguidos, el sistema bloquea temporalmente el ingreso para ese correo (por defecto, 5 intentos en 15 minutos). Esperá unos minutos y volvé a intentar, o pedile al administrador que te asigne una contraseña nueva.

### 3.3. Cambiá tu contraseña la primera vez

Si el administrador te dio una contraseña inicial, cambiala:

1. Arriba a la derecha, tocá tu nombre.
2. Elegí **Perfil y contraseña**.
3. En **Cambiar contraseña**, escribí la actual, la nueva (mínimo 8 caracteres) y repetila.
4. Tocá **Cambiar contraseña**. Las demás sesiones abiertas con tu usuario se cierran por seguridad.

### 3.4. Cerrar sesión

Tocá tu nombre arriba a la derecha → **Cerrar sesión**. Hacelo siempre en computadoras compartidas.

### 3.5. Los dos tipos de usuario

- **Usuario normal**: carga y consulta toda la operación diaria (clientes, obras, órdenes, certificados, reajustes, pagos, retenciones, reclamos, documentos, reportes).
- **Administrador**: además puede crear usuarios, cambiar la configuración, ver la auditoría, eliminar registros sin historia, reactivar certificados anulados y anular retenciones. El detalle completo está en la [sección 27](#27-qué-puede-hacer-cada-rol).

---

## 4. Cómo está organizada la pantalla

### 4.1. Menú lateral (izquierda)

Está agrupado por tema:

- **General**: *Inicio* (indicadores y alertas) y *Vencimientos* (calendario).
- **Contratos**: *Clientes*, *Obras*, *Órdenes de compra*.
- **Finanzas**: *Certificados*, *Reajustes CAC*, *Índices CAC*, *Pagos*.
- **Cauciones**: *Retenciones*, *Reclamos*.
- **Información**: *Reportes*, *Documentos*.
- **Administración** (solo la ven los administradores): *Usuarios*, *Configuración*, *Auditoría*.

En el celular o en pantallas chicas, el menú se abre con el botón **☰** de arriba a la izquierda.

### 4.2. Barra superior

- **Título** de la sección donde estás.
- **Buscador**: escribí al menos 2 letras para buscar clientes, obras, órdenes, certificados, pagos, retenciones o reclamos ([sección 21](#21-búsqueda-global)).
- **Campana**: recordatorios pendientes; el número rojo indica cuántos no viste ([sección 20](#20-recordatorios-la-campana)).
- **Tu nombre**: perfil, contraseña y cerrar sesión.

### 4.3. Cómo se ven los listados

- En computadora, los listados son **tablas**. Hacé clic en el dato resaltado (en azul) para abrir la ficha.
- En celular, cada fila se muestra como una **tarjeta**; tocala para abrirla.
- Arriba de cada listado hay **filtros** (buscador, estado, etc.). El sistema **recuerda los filtros** mientras dure tu sesión en esa pestaña del navegador.
- Abajo está la **paginación** (registros totales y flechas para cambiar de página).

### 4.4. Formatos

- **Importes**: formato argentino, por ejemplo `$ 1.234.567,89`. Cada importe se muestra con su moneda (ARS o USD) y **las monedas nunca se suman entre sí**.
- **Fechas**: en las fichas y listados se muestran como `DD/MM/AAAA`. El selector de fechas de los formularios usa el formato de idioma de tu navegador: si te aparece `mm/dd/yyyy`, es porque el navegador está en inglés.
- **Cantidades**: hasta 4 decimales (ej.: `300,5000 m²`).
- Los campos con **asterisco rojo (*)** son obligatorios.

### 4.5. Mensajes del sistema

- Arriba a la derecha aparecen avisos breves: **verde** (salió bien), **rojo** (error), **amarillo** (atención).
- Cuando una acción tiene consecuencias importantes (anular, recalcular, eliminar), se abre una **ventana de confirmación** que explica el impacto y, si corresponde, pide un **motivo**. Ese motivo queda en la auditoría.

---

## 5. El orden correcto para cargar la información

Cada dato depende del anterior. Seguí este orden la primera vez:

```
1. Cliente
   └─ 2. Obra
        └─ 3. Orden de compra  (con su configuración de caución)
             └─ 4. Rubros de la orden  (cantidad, unidad y precio)
5. Índices CAC  (si vas a reajustar)
6. Certificados  (cantidades del período por rubro)
7. Pagos  (y su aplicación a certificados)
8. Finalización de la obra / orden / alcance  (cuando termine de verdad)
9. Retenciones → reclamos → devolución (pago con concepto "Devolución de caución")
```

---

## 6. Inicio (centro de control)

Es la primera pantalla después de entrar. Resume toda la situación financiera.

### 6.1. Moneda

Si hay operaciones en más de una moneda, arriba a la derecha aparecen botones **ARS / USD**. Los indicadores muestran solo la moneda elegida. El botón **Actualizar** vuelve a calcular todo.

### 6.2. Indicadores (tarjetas)

Cada tarjeta tiene un ícono **ⓘ**: si pasás el mouse por encima, explica exactamente qué se suma. Tocando la tarjeta vas al listado correspondiente.

| Tarjeta | Qué muestra |
|---|---|
| **Total contratado** | Cantidad × precio original de los rubros activos de todas las órdenes. **No incluye reajustes CAC.** |
| **Total certificado (base)** | Suma del importe base de los certificados emitidos. No cuenta borradores ni anulados. |
| **Reajustes CAC aprobados** | Reajustes en estado *Aprobado*, *Facturado* o *Pagado*. Un reajuste solo calculado no entra acá. |
| **Total facturado** | Importe bruto de certificados *Facturados*, *Parcialmente pagados* o *Pagados*. |
| **Cobrado** | Pagos aplicados al neto de certificados. **No incluye** devoluciones de caución. |
| **Saldo pendiente de cobro** | Neto de certificados facturados menos lo efectivamente cobrado. |
| **Total retenido por caución** | Cauciones generadas por certificados vigentes. |
| **Cauciones recuperadas** | Dinero de cauciones efectivamente devuelto (registrado como pago). |
| **Cauciones por recuperar** | Cauciones todavía no devueltas, **aunque ya se hayan reclamado**. |
| **Habilitadas para reclamar** | Cantidad de cauciones cuya fecha de liberación ya llegó y siguen con saldo. |
| **Vencen en 30 días** | Cantidad de cauciones cuya liberación cae en los próximos 30 días. |
| **Certificados vencidos e impagos** | Certificados cuyo vencimiento de pago ya pasó y siguen con saldo. |
| **Reajustes pendientes** | Reajustes calculados o presentados que el cliente todavía no aprobó. |

### 6.3. Avisos de cobro para enviar

Si algún certificado o caución vence en una semana, mañana u hoy, arriba de las alertas aparece la tarjeta **Avisos de cobro para enviar**, con botones para escribirle al cliente por **WhatsApp** o por **correo**. Ver sección 20.3.

### 6.4. Alertas

Lista ordenada por prioridad (alta, media, baja), con un enlace directo a cada caso:

- Caución que **vence en los próximos 7 días**.
- Caución **habilitada para reclamar**.
- Caución **vencida y sin recuperar**.
- Caución **sin fecha de liberación** (falta registrar la finalización).
- Certificado **vencido e impago**.
- Certificado con **pago parcial**.
- Reajuste CAC **pendiente de aprobación**.
- Obra que **se acerca a su fin estimado sin fecha real** de finalización.

### 6.5. Gráficos

- **Evolución mensual**: certificado, cobrado y retenido por mes.
- **Retenciones acumuladas**: cómo crece la caución retenida en el tiempo.
- **Próximas liberaciones (90 días)**: qué cauciones se liberan pronto y por cuánto.
- **Saldo pendiente por cliente** y **por obra**: quién te debe más.

Si todavía no cargaste datos, vas a ver todo en cero y los gráficos vacíos: es normal.

---

## 7. Vencimientos (calendario)

Muestra, mes a mes, todo lo que tiene fecha:

| Ícono | Evento |
|---|---|
| 🛡 verde | **Liberación de caución**: desde ese día se puede reclamar. |
| 🧾 azul | **Vencimiento de pago de un certificado**. |
| 💵 amarillo | **Fecha prometida de pago** de un reclamo. |
| ☎ gris | **Próximo seguimiento** de un reclamo. |

- Con las flechas **‹ ›** cambiás de mes; tocando el nombre del mes volvés al mes actual.
- A la derecha (o abajo en el celular), la **Agenda del mes** lista los eventos con su importe. Tocá cualquiera para abrir el registro.
- El día de hoy aparece remarcado.

Las cauciones que todavía no tienen fecha de finalización **no aparecen en el calendario**, porque el sistema no inventa fechas. Las encontrás en *Retenciones → Sin fecha de finalización*.

---

## 8. Clientes

### 8.1. Para qué sirve

Es el padrón de empresas que contratan a Conkreto. Todo cuelga de un cliente: obras, órdenes, certificados, pagos y reclamos.

### 8.2. Crear un cliente

1. Menú **Clientes** → **Nuevo cliente**.
2. Completá:
   - **Razón social** (obligatoria).
   - **Nombre comercial**.
   - **CUIT** (formato sugerido `30-12345678-9`). El sistema no permite cargar dos clientes con el mismo CUIT; revisá bien los dígitos, porque no controla el dígito verificador.
   - **Estado**: *Activo* o *Inactivo*.
   - **Contacto**, **correo**, **teléfono**, **dirección**, **observaciones**.
   - El **teléfono** y el **correo** se usan para los **avisos de cobro** (ver sección 20.3). Cargá el teléfono con código de país y de área, sin el 0 ni el 15: por ejemplo `5491123456789` para un celular de Buenos Aires. Si lo cargás como `011 2345-6789`, el sistema igual intenta convertirlo, pero es más seguro el formato completo.
   - En **Contacto** poné el nombre de la persona a quien le escriben: el mensaje empieza con "Hola {contacto}".
3. **Guardar**.

### 8.3. La ficha del cliente

Al abrir un cliente ves:

- Sus datos de contacto (botón **Editar** para modificarlos).
- Sus **obras**, **órdenes de compra** y **retenciones**.
- La documentación adjunta.

### 8.4. Eliminar un cliente

Solo un administrador puede hacerlo, y **solo si el cliente no tiene obras ni órdenes**. Si ya tiene movimientos, ponelo en estado *Inactivo*.

---

## 9. Obras

### 9.1. Para qué sirve

Agrupa las órdenes de compra de un mismo proyecto físico. La obra es importante porque **su fecha real de finalización puede iniciar el plazo de las cauciones**.

### 9.2. Crear una obra

1. Menú **Obras** → **Nueva obra**.
2. Completá:
   - **Cliente** (obligatorio).
   - **Nombre de la obra** (obligatorio).
   - **Código interno**.
   - **Estado**: *Planificación*, *En ejecución*, *Finalizada*, *Suspendida* o *Cancelada*.
   - **Dirección o ubicación**, **responsable interno**.
   - **Fecha de inicio**.
   - **Fecha estimada de finalización**. Es solo una referencia: **no inicia el plazo de ninguna caución**. Sirve para que el sistema te avise si la obra se acerca a esa fecha y todavía no registraste la finalización real.
   - **Observaciones**.
3. **Guardar**. Se abre la ficha de la obra.

### 9.3. La ficha de la obra (pestañas)

| Pestaña | Contenido |
|---|---|
| **Resumen** | Contratado, certificado (base), pendiente de cobro y cauciones por recuperar, separados por moneda. Datos de la obra y **fin real** (si no está registrado aparece "Sin registrar" en amarillo). |
| **Órdenes** | Las OC de la obra y el botón **Nueva orden** (ya viene con la obra elegida). |
| **Certificados** | Todos los certificados de la obra. |
| **Reajustes** | Reajustes CAC de la obra. |
| **Pagos** | Pagos del cliente; abrí cada uno para ver a qué se aplicó. |
| **Retenciones** | Cauciones generadas en la obra. |
| **Reclamos** | Reclamos vinculados a la obra. |
| **Documentación** | Archivos adjuntos (actas, planos, contratos). |
| **Historial** | (Solo administradores) cambios registrados en la auditoría. |

### 9.4. Registrar la finalización de la obra

Botón **Registrar finalización** en la ficha de la obra. Está explicado en detalle en la [sección 16](#16-registrar-la-finalización-de-obra-orden-o-alcance). **La fecha real de finalización solo se carga desde ahí**, no desde *Editar*, para que quede trazada y recalcule las cauciones.

---

## 10. Órdenes de compra

### 10.1. Para qué sirve

La OC es el contrato. Define **qué se va a hacer** (rubros, cantidades, precios) y **las reglas de la caución** (porcentaje, base y liberación). Cada certificado toma esas reglas de su OC.

### 10.2. Crear una orden

1. Menú **Órdenes de compra** → **Nueva orden** (o desde la pestaña *Órdenes* de una obra).
2. **Datos generales**:
   - **Número de OC del cliente** (obligatorio; tal como figura en el documento del cliente).
   - **Moneda**: ARS o USD. Todo lo que cuelgue de esta OC va a estar en esa moneda.
   - **Cliente** y **Obra** (primero elegí el cliente; después aparecen sus obras).
   - **Fecha de emisión** y **fecha de aceptación**.
   - **Condiciones de pago** (texto libre, ej.: "30 días fecha de factura") y **plazo de pago en días**.
3. **Retención de caución**:
   - **Porcentaje retenido** (por defecto 5).
   - **Base de la retención**. Elegí la que diga el contrato:

     | Opción | Sobre qué se calcula el porcentaje |
     |---|---|
     | **Solo importe base certificado** | Solo cantidad × precio original. El CAC no se retiene. |
     | **Base más reajustes CAC aprobados** | Base + reajustes que el cliente ya aprobó. |
     | **Importe bruto total** | Base + todo el CAC registrado + otros conceptos. |
     | **Base personalizada** | Marcás qué conceptos entran: importe base, CAC aprobado, CAC registrado, otros conceptos. |

   - Abajo aparece un **ejemplo en vivo** (con $ 1.000.000 de base y $ 200.000 de CAC) para que veas cuánto se retendría con la configuración elegida.
4. **Liberación de la caución**:
   - **Evento que inicia el plazo**:

     | Opción | Desde cuándo se cuentan los días |
     |---|---|
     | **Finalización de toda la obra** | Desde la fecha real de fin de la obra. |
     | **Finalización de la orden de compra** | Desde la fecha real de fin de esta OC. *(opción por defecto)* |
     | **Finalización de un conjunto de trabajos** | Desde que termina un alcance determinado (hay que crearlo antes en la OC). |
     | **Fecha contractual específica** | Desde una fecha fijada en el contrato (aparece el campo para cargarla). |
     | **Fecha del certificado** | Desde la fecha de emisión de cada certificado. **Usala solo si el contrato lo dice expresamente.** |

   - **Plazo (días corridos)**: por defecto 180.
   - **Fecha de liberación pactada (opcional)**: si el contrato fija una fecha exacta de devolución, cargala acá. **Reemplaza al cálculo** de evento + días.
5. **Observaciones** y **Crear orden**. Se abre la ficha de la OC para que cargues los rubros.

### 10.3. Cargar los rubros (obligatorio para poder certificar)

En la ficha de la OC, tarjeta **Rubros y cantidades** → **Agregar rubro**:

- **Descripción del trabajo** (obligatoria), ej.: "Hormigón H-21 en losas".
- **Sector o ubicación**, ej.: "Torre A – piso 3".
- **Unidad de medida**: m², m³, metros lineales, unidades, horas, global u otra.
- **Cantidad contratada** (obligatoria, mayor a cero).
- **Precio unitario original** (obligatorio).
- Abajo se muestra el **importe original** (cantidad × precio).

La tabla de rubros muestra para cada uno: **contratado**, **certificado** (acumulado de todos los certificados vigentes), **pendiente** (lo que falta certificar; en rojo si se pasó) y el importe.

**Editar un rubro**: botón del lápiz. Si querés bajar la cantidad contratada por debajo de lo que ya se certificó, el sistema lo impide salvo que marques **"Autorizo bajar la cantidad por debajo de lo ya certificado"**.

**Eliminar un rubro**: solo administradores, y solo si **nunca se certificó**.

### 10.4. Indicadores de la OC

Arriba de la ficha:

- **Contratado (sin CAC)**.
- **Certificado base** y **% de avance** sobre lo contratado.
- **Reajustes CAC** registrados.
- **Cobrado**.
- **Pendiente de cobro** (solo certificados facturados).
- **Caución por recuperar**.

También hay un **gráfico de evolución** (base y CAC por certificado), las **condiciones contractuales**, los **certificados**, las **retenciones** y los **documentos** de la orden.

### 10.5. Alcances (conjuntos de trabajos)

En **Condiciones contractuales → Alcances**, escribí un nombre (ej.: "Torre A") y tocá **Agregar**. Los alcances sirven para:

- Elegir **Finalización de un conjunto de trabajos** como evento de liberación.
- Registrar la finalización de esa parte desde el botón **Finalización**.

### 10.6. Editar una orden y el recálculo de certificados

Botón **Editar** en la ficha de la OC. Podés cambiar número, estado (*Borrador*, *Vigente*, *Finalizada*, *Cancelada*), fechas, condiciones de pago y la configuración de caución y liberación.

**Importante**: si cambiás **porcentaje, base de retención, conceptos, evento de liberación, días, fecha contractual, fecha pactada o alcance**, y la OC ya tiene certificados emitidos, el sistema **no recalcula en silencio**. Primero te muestra una ventana con:

- La lista de certificados afectados y la retención actual de cada uno.
- Un campo **Motivo** obligatorio.

Solo si confirmás con **Recalcular y guardar**, se recalculan las retenciones y fechas de liberación de esos certificados. El cálculo anterior queda guardado en la auditoría.

> Cada certificado guarda una "foto" de la configuración de caución vigente cuando se emitió. Por eso, cambiar la OC no altera los certificados viejos salvo que confirmes el recálculo.

### 10.7. Eliminar una orden

Solo administradores, y solo si la OC **no tiene certificados**.

---

## 11. Certificados

### 11.1. Para qué sirve

El certificado registra lo ejecutado en un período y calcula automáticamente base, reajuste, bruto, caución, descuentos y neto. **Al guardar un certificado, el sistema genera su retención de caución.**

### 11.2. Crear un certificado paso a paso

1. Menú **Certificados** → **Nuevo certificado**, o desde la ficha de la OC → **Nuevo certificado** (ya viene con la orden elegida).
2. **Datos del certificado**:
   - **Orden de compra** (solo aparecen las OC *Vigentes*).
   - **Número de certificado del cliente** (obligatorio; no se puede repetir dentro de la misma OC, salvo que el anterior esté anulado).
   - **Tipo**: *Avance* (normal), *Nota de crédito* (resta: sus importes se toman en negativo) o *Nota de débito* (suma).
   - **Estado** inicial: *Borrador*, *Presentado*, *Aprobado*, *Facturado* u *Observado*. **No podés elegir "Pagado"**: eso lo determina el sistema con los pagos que registres.
   - **Fechas**: emisión, período desde/hasta, recepción, aprobación, facturación y **vencimiento del pago**. El vencimiento es el que usan las alertas de "certificado vencido e impago".
3. **Ítems certificados en el período**. Aparece una fila por cada rubro activo de la OC, con lo contratado, lo ya certificado, lo pendiente y el precio unitario. Para cada rubro que se certifique en este período:
   - **Cantidad del período** (dejá vacío o en 0 los rubros que no se certifican).
   - **Reajuste CAC**:
     - *Sin reajuste*.
     - *Variación simple*: elegí **índice base** e **índice actualizado** (tienen que estar cargados en *Índices CAC*). El reajuste es base × (actualizado ÷ base) − base.
     - *Contractual*: cargá el **reajuste validado** (importe) y opcionalmente la **fórmula contractual** como texto.
   - **Estado del reajuste**: *Calculado*, *Presentado* o *Aprobado*. Un reajuste calculado **no se toma como aprobado por el cliente**.
   - Si la cantidad hace que el acumulado **supere lo contratado**, aparece un aviso amarillo. Para seguir tenés que marcar **"Autorizo el excedente"** y escribir el **motivo**. Sin eso, el sistema no lo guarda.
4. **Otros conceptos**: importes a sumar (ej.: adicionales) y otros descuentos o retenciones (ej.: multas, anticipos). Más **observaciones**.
5. **Vista previa del cálculo** (se actualiza mientras escribís):

   ```
   Importe base
   + Reajuste CAC
   + Otros conceptos
   = Importe bruto
     Base sujeta a retención (según la OC)
   − Retención del X %
   − Otros descuentos
   = Neto a cobrar
   ```

6. Tocá **Guardar certificado**. El servidor hace el cálculo definitivo (la vista previa es orientativa) y abre la ficha.

### 11.3. La ficha del certificado

- **Cálculo del certificado**: el desglose completo y, debajo, la **fórmula de la retención** en texto (qué conceptos entraron en la base y con qué porcentaje).
- **Cobro**: cobrado, pendiente y fechas.
- **Retención de caución**: retenido, pendiente, estado y fecha de liberación (o "Pendiente de fecha de finalización").
- **Ítems**: cantidad del período, acumulado, precio, base, método de reajuste, coeficiente y reajuste. Si hubo excedente autorizado, se ve el motivo.
- **Reajustes CAC**: cada reajuste con su estado y si es *oficial* (aprobado por el cliente) o *estimado*.
- **Pagos aplicados**: qué pagos cubrieron este certificado. "Aprobado no significa pagado."
- **Documentación**: adjuntá el PDF del certificado, la factura, etc.

### 11.4. Acciones sobre un certificado

| Botón | Qué hace |
|---|---|
| **Registrar pago** | Abre el alta de pago con el cliente, la moneda, el importe pendiente y la aplicación ya cargados. |
| **Estado y fechas** | Cambia número, estado, fechas y observaciones. *Pagado* y *Parcialmente pagado* se recalculan solos con los pagos. |
| **Anular** | Deja el certificado sin efecto (pide motivo). Deja de sumar en los saldos, **su caución queda anulada** y **las cantidades certificadas se liberan** para volver a certificarlas. Sigue visible en el historial. **No se puede anular si tiene pagos aplicados**: primero hay que anular esos pagos. |
| **Reactivar** | (Solo administradores, sobre un certificado anulado) vuelve a computarlo con estado *Presentado*. Pide motivo. |

**¿Y si me equivoqué en una cantidad?** Para corregir cantidades de un certificado ya emitido, lo correcto es **anularlo y cargar uno nuevo**, así queda la historia completa.

### 11.5. Ciclo de vida normal de un certificado

```
Borrador → Presentado → Aprobado → Facturado → Parcialmente pagado → Pagado
                 ↘ Observado (el cliente lo objetó)
   cualquier estado → Anulado (con motivo)
```

- **Borrador** no cuenta en los totales.
- **Parcialmente pagado** y **Pagado** los pone el sistema según lo cobrado. Si anulás un pago, el certificado vuelve a *Facturado*, *Aprobado* o *Presentado* según las fechas cargadas.

---

## 12. Índices CAC

### 12.1. Para qué sirve

Es la tabla de valores mensuales del índice CAC que se usan para calcular los reajustes. **El sistema no descarga índices de internet**: los cargás vos tal como los publica la Cámara Argentina de la Construcción.

### 12.2. Cargar un índice

1. Menú **Índices CAC** → **Cargar índice**.
2. Completá:
   - **Mes** y **año** del período.
   - **Serie** (obligatoria): un código que identifique qué índice es, ej.: `CAC-GENERAL`, `CAC-MATERIALES`, `CAC-MANO-OBRA`. Usá siempre el mismo código para la misma serie.
   - **Descripción de la serie**.
   - **Valor publicado** (obligatorio, mayor a cero; hasta 4 decimales).
   - **Fecha de publicación**, **fuente**, **enlace de respaldo** y **observaciones**.
3. **Guardar**.

No se puede cargar dos veces el mismo período para la misma serie.

### 12.3. Editar o eliminar

Solo los administradores pueden **editar** o **eliminar** un índice. **Un índice que ya se usó en un reajuste no se puede eliminar.**

---

## 13. Reajustes CAC

### 13.1. Para qué sirve

Lleva el control de cada reajuste: cuánto se calculó, si se presentó al cliente, si lo aprobó, si se facturó y si se cobró. **Calculado, presentado, aprobado, facturado y pagado son estados distintos** y el sistema nunca da por aprobado algo que solo calculaste.

Hay dos formas de que exista un reajuste:

1. **Dentro de un certificado**: al elegir un método de reajuste en un rubro (sección 11.2). Se crea automáticamente.
2. **Por separado**: menú **Reajustes CAC** → **Registrar reajuste**. Sirve para reajustes complementarios, posteriores, notas de crédito o débito, o correcciones.

### 13.2. Registrar un reajuste por separado

1. **Orden de compra** y, si corresponde, **certificado relacionado**.
2. **Tipo de registro**: *Certificado complementario*, *Ajuste posterior*, *Nota de crédito*, *Nota de débito* o *Corrección*.
3. **Método de cálculo**:
   - *Variación simple*: cargá la **base reajustable**, elegí **índice base** e **índice actualizado** y tocá **Calcular vista previa** para ver coeficiente, importe actualizado y reajuste.
   - *Contractual*: cargá el **importe validado** y la **fórmula y parámetros**.
4. **Estado** inicial: *Calculado*, *Presentado* o *Aprobado* (elegí *Aprobado* solo si el cliente ya lo aprobó).
5. **"La base ya incluye una actualización anterior"**: marcalo si el importe que estás reajustando ya fue actualizado antes. El sistema **bloquea el doble reajuste** salvo que marques también **"El contrato permite volver a reajustarla"** y escribas el motivo.
6. **Registrar**.

### 13.3. Cambiar el estado de un reajuste

En la ficha del reajuste aparecen botones **Marcar presentado**, **Marcar aprobado**, **Marcar facturado**, **Marcar pagado**, **Marcar rechazado** y **Marcar anulado**:

- Cada cambio pide confirmación y queda en la auditoría.
- **Anular** pide motivo obligatorio.
- Al aprobar, si la OC retiene sobre "Base + CAC aprobado", **la retención del certificado relacionado se recalcula**.
- *Rechazado* y *Anulado* dejan de sumar en el certificado.

### 13.4. Qué ves en la ficha

- **Cálculo**: base reajustable, coeficiente, importe actualizado y reajuste calculado, más la fórmula.
- **Seguimiento**: tipo, método, períodos de los índices, importe presentado, importe aprobado, enlaces a la orden y al certificado, motivo de anulación si lo hubiera.

---

## 14. Pagos

### 14.1. Para qué sirve

Registra **el dinero que efectivamente entró** y **a qué se aplica**. Es lo único que marca un certificado como pagado o una caución como recuperada.

### 14.2. Registrar un pago

1. Menú **Pagos** → **Registrar pago**, o desde un certificado → **Registrar pago**, o desde una retención → **Registrar devolución**.
2. **Datos del pago**:
   - **Cliente** (obligatorio).
   - **Fecha**.
   - **Moneda** (tiene que coincidir con la de los certificados o cauciones a los que lo apliques).
   - **Importe total recibido** (obligatorio).
   - **Medio de pago** (transferencia, cheque, etc.), **número de transferencia o referencia** y **observaciones**.
3. **Cómo se distribuye el pago**: tocá **Agregar aplicación** por cada destino:
   - **Concepto**:
     - *Neto del certificado*: elegí el certificado (solo aparecen los del cliente, en esa moneda y con saldo pendiente).
     - *Devolución de caución*: elegí la retención (solo las que tienen saldo por recuperar).
     - *Otro*: un importe que no corresponde a certificados ni cauciones.
   - **Importe** de esa aplicación.
   - Si necesitás aplicar más que el saldo pendiente (por ejemplo, un redondeo acordado), marcá **"Ajuste autorizado: permitir superar el saldo"** y escribí el motivo.
4. Abajo se ve el control: **Importe del pago**, **Aplicado** y **Sin aplicar**. Si lo aplicado supera lo recibido, aparece en rojo y no se puede guardar (salvo ajuste autorizado).
5. **Registrar pago**.

**Un solo pago puede cubrir varios certificados y cauciones a la vez.** También podés dejar parte del pago **sin aplicar** y distribuirla después.

### 14.3. Qué pasa al registrar un pago

- Cada certificado al que aplicaste dinero pasa a **Parcialmente pagado** (si queda saldo) o **Pagado** (si se cubrió el neto).
- Cada caución a la que aplicaste una devolución pasa a **Parcialmente recuperada** o **Recuperada**.
- El sistema rechaza aplicar dos veces el mismo pago al mismo certificado o caución.

### 14.4. La ficha del pago

- **Importe recibido**, **aplicado** y **sin aplicar**.
- **Aplicaciones**: concepto, destino (con enlace) e importe.
- **Datos del pago** y **comprobantes** adjuntos.
- **Aplicar saldo**: si quedó dinero sin aplicar, distribuilo acá.
- **Anular**: pide motivo. Los certificados y cauciones a los que se aplicó **vuelven a mostrar saldo pendiente**. El pago queda visible como anulado.

---

## 15. Retenciones (cauciones)

### 15.1. Para qué sirve

Cada certificado genera **una retención de caución**: lo que el cliente se queda como garantía. Esta sección te dice cuánto te deben devolver, desde cuándo podés reclamarlo y qué pasó con cada una.

**No se cargan a mano**: se crean solas al guardar un certificado, con la configuración que tenía la OC en ese momento.

### 15.2. Listado y filtros

Columnas: certificado, cliente/obra/OC, estado, retenido, recuperado, **pendiente** y fecha de **liberación** (en amarillo si está próxima, en rojo si ya venció; "Pendiente de fecha" si falta el hito).

Filtro **Situación**:

- **Con saldo por recuperar**.
- **Habilitadas para reclamar**: la fecha de liberación ya llegó.
- **Vencen en 30 días**.
- **Vencidas sin recuperar**: pasó la fecha y todavía no te pagaron.
- **Sin fecha de finalización**: falta registrar el hito que inicia el plazo.

Filtro **Estado**: cualquiera de los estados de la tabla siguiente.

### 15.3. Estados de una caución (los calcula el sistema)

El sistema decide el estado en este orden:

| Estado | Cuándo |
|---|---|
| **Anulada** | El certificado se anuló o un administrador anuló la retención. |
| **Recuperada** | Se registró la devolución completa (pago con concepto *Devolución de caución*). |
| **Parcialmente recuperada** | Se devolvió una parte. |
| **En disputa** | La marcaste manualmente como en disputa. |
| **Pendiente de fecha de finalización** | Todavía no se registró el hito que inicia el plazo, así que **no hay fecha de liberación**. |
| **Reclamada** | Tiene un reclamo abierto. |
| **Vencida sin recuperar** | La fecha de liberación ya pasó y no se devolvió. |
| **Habilitada para reclamar** | Hoy es la fecha de liberación. |
| **Próxima a vencer** | La liberación cae en los próximos 30 días. |
| **En plazo** | Tiene fecha, pero todavía falta más de un mes. |

> **Importante**: "Habilitada para reclamar" o "Reclamada" **no significa cobrada**. La caución sigue sumando en "Cauciones por recuperar" hasta que registres su devolución como pago.

### 15.4. La ficha de una retención

- **Avisos** arriba: si falta la fecha de finalización (con enlace para registrarla) o si está vencida sin recuperar.
- **Retenido**, **recuperado** y **pendiente de recuperar**.
- **Cómo se calculó**: qué conceptos entraron en la base (base, CAC aprobado, CAC registrado, otros), la base total, el porcentaje y el importe retenido.
- **Plazo de liberación**: criterio, días, **fecha que inicia el plazo**, fecha pactada, **liberación calculada**, desde cuándo está habilitada, último reclamo y próximo seguimiento.
- **Historial de reclamos** de esta caución.
- **Observaciones** (editables) y **documentación**.

### 15.5. Acciones

| Botón | Qué hace |
|---|---|
| **Registrar reclamo** | Abre el alta de reclamo con esta caución ya elegida. |
| **Registrar devolución** | Abre el alta de pago con concepto *Devolución de caución*, el cliente y el importe pendiente ya cargados. |
| **Marcar en disputa / Quitar disputa** | Indica que hay un desacuerdo con el cliente sobre esta caución. |
| **Anular** (ícono ⊘, solo administradores) | Solo para corregir errores de carga. Pide motivo. **Si el cliente devolvió la plata, no la anules: registrá la devolución como pago.** |

### 15.6. Cómo se calcula la fecha de liberación

```
Si la OC tiene "fecha de liberación pactada"  →  esa fecha, sin calcular nada.
Si no:
   fecha que inicia el plazo + días del plazo = fecha de liberación
   (si todavía no existe la fecha que inicia el plazo → no hay fecha; queda "Pendiente de fecha")
```

La fecha que inicia el plazo depende del evento elegido en la OC:

- *Finalización de la obra / de la orden / de un alcance* → la fecha que registres en **Registrar finalización**.
- *Fecha contractual* → la fecha contractual cargada en la OC.
- *Fecha del certificado* → la fecha de emisión de cada certificado.

**El sistema nunca inventa una fecha de liberación.**

---

## 16. Registrar la finalización de obra, orden o alcance

### 16.1. Para qué sirve

Es el paso que **pone en marcha el reloj de las cauciones**. Mientras no lo hagas, las cauciones que dependen de esa finalización quedan en *Pendiente de fecha de finalización*.

### 16.2. Desde dónde se hace

- Ficha de la **obra** → **Registrar finalización** (para "toda la obra").
- Ficha de la **orden** → **Finalización** (para "esta orden", "fecha contractual de esta orden" o "un conjunto de trabajos").

### 16.3. Paso a paso

1. **Qué terminó**: *Toda la obra*, *Esta orden de compra*, *Fecha contractual de esta orden* o *Un conjunto de trabajos* (y elegís el alcance).
2. **Fecha efectiva de finalización** (obligatoria): la fecha **real**, por ejemplo la del acta de recepción provisoria.
3. **Observaciones / acta**, ej.: "Acta de recepción provisoria firmada el 15/10/2026".
4. Tocá **Revisar impacto**. El sistema muestra la tabla **Retenciones afectadas**: cada una con su pendiente, la **liberación anterior** y la **nueva liberación**.
5. Si estás de acuerdo, tocá **Confirmar finalización**. Si hay retenciones afectadas, la observación es obligatoria, porque cambia vencimientos.

### 16.4. Qué hace el sistema al confirmar

- Guarda el hito con fecha, usuario y observación.
- Si fue "toda la obra", completa la **fecha real de fin** de la obra.
- Recalcula la fecha de liberación y el estado de cada caución afectada, y lo deja en la auditoría.
- Las cauciones de **certificados que se emitan después** toman automáticamente esa fecha.
- Si registrás una nueva finalización para lo mismo (por ejemplo, para corregir la fecha), la anterior queda inactiva y se vuelve a mostrar el impacto antes de confirmar.

Si ninguna caución depende todavía de ese hito, el sistema lo registra igual para las cauciones futuras.

---

## 17. Reclamos

### 17.1. Para qué sirve

Lleva la historia de las gestiones para que el cliente devuelva las cauciones: cuándo se reclamó, por qué medio, a quién, qué respondió y cuándo prometió pagar.

### 17.2. Registrar un reclamo

1. Menú **Reclamos** → **Registrar reclamo**, o desde la ficha de una retención → **Registrar reclamo**.
2. Completá:
   - **Cliente** y **fecha del reclamo**.
   - **Cauciones reclamadas**: marcá una o varias de la lista (solo aparecen las que tienen saldo). Abajo se suma el **importe reclamado**.
   - **Canal**: correo, WhatsApp, teléfono, nota formal u otro.
   - **Estado**: *Pendiente de reclamar*, *Reclamo enviado*, *En seguimiento*, *Fecha de pago prometida*, *Parcialmente recuperado*, *Recuperado* o *En disputa*.
   - **Contacto destinatario** y **responsable interno**.
   - **Fecha prometida de pago** y **próximo seguimiento**: ambas aparecen en el calendario y generan recordatorios.
   - **Respuesta recibida** y **observaciones**.
3. **Registrar**.

**Registrar un reclamo no marca la caución como recuperada.** Solo cambia su estado a *Reclamada*.

### 17.3. Seguimiento del reclamo

En la ficha del reclamo:

- **Datos del reclamo**: importe, canal, destinatario, responsable, fechas, enlaces a obra y orden, y las **cauciones incluidas**.
- **Registrar gestión**: cada vez que llamás, escribís o recibís respuesta, cargá **qué se hizo o respondió**. Opcionalmente cambiá el **estado**, la **fecha prometida** o el **próximo seguimiento**. Se guarda en el historial.
- **Historial cronológico**: todas las gestiones con fecha y hora.
- **Comprobantes**: adjuntá correos, notas o capturas.
- **Anular**: pide motivo; el reclamo queda visible como anulado.

Cuando el cliente finalmente paga, **registrá el pago** con concepto *Devolución de caución*; así la caución pasa a *Recuperada*.

---

## 18. Reportes

### 18.1. Para qué sirve

Listados listos para analizar o enviar, con los **mismos cálculos que la pantalla**.

### 18.2. Reportes disponibles (pestañas)

| Reporte | Qué muestra |
|---|---|
| **Estado de cuenta por cliente** | Certificados con base, reajuste, bruto, retención, neto, cobrado y pendiente. |
| **Resumen financiero por obra** | Lo mismo, para agrupar o filtrar por obra. |
| **Certificados y sus pagos** | Cada certificado con lo cobrado. |
| **Reajustes CAC** | Todos los reajustes con su estado e importes. |
| **Retenciones por certificado** | Cada caución con retenido, recuperado, pendiente y liberación. |
| **Retenciones próximas a vencer** | Las que se liberan pronto. |
| **Retenciones habilitadas para reclamar** | Las que ya se pueden reclamar. |
| **Retenciones vencidas e impagas** | Las que pasaron la fecha sin devolución. |
| **Historial de reclamos** | Reclamos con canal, estado, importe, respuesta y seguimiento. |
| **Saldos pendientes de cobro** | Certificados facturados con saldo. |

### 18.3. Filtros y totales

- Filtrá por **cliente**, **obra**, **moneda** y rango de **fechas**.
- Si todas las filas son de la misma moneda, abajo aparecen los **totales**. Si hay monedas mezcladas, el sistema te pide filtrar por moneda (nunca suma pesos con dólares).

### 18.4. Exportar

Botones **CSV** y **Excel** arriba a la derecha. El archivo descargado tiene **exactamente las mismas filas y filtros** que estás viendo. El CSV se abre bien en Excel con acentos.

---

## 19. Documentos y adjuntos

### 19.1. Adjuntar archivos

En casi todas las fichas (cliente, obra, orden, certificado, pago, retención, reclamo) hay una tarjeta **Documentación** o **Comprobantes**:

1. Tocá el botón para elegir el archivo.
2. Se sube y queda listado con nombre, tamaño y fecha.

**Tipos permitidos**: PDF, PNG, JPG, JPEG, WEBP, XLSX, XLS, CSV, DOC, DOCX y TXT. **Tamaño máximo**: 10 MB por archivo (configurable por el área técnica).

### 19.2. Menú Documentos

Lista **todos** los archivos del sistema, con un filtro por tipo de registro. Desde acá podés:

- Ir al registro al que pertenece cada archivo.
- **Descargar**.
- **Eliminar** (pide confirmación y queda en la auditoría).

Los archivos **solo se pueden descargar con una sesión iniciada**: no hay enlaces públicos.

---

## 20. Recordatorios (la campana)

### 20.1. Qué son

Avisos automáticos sobre vencimientos de cauciones, certificados y reclamos. Se generan según las **reglas de recordatorios**:

- 30 días antes del vencimiento (aviso interno).
- 15 días antes (aviso interno).
- **Avisar al cliente: falta una semana** (7 días antes).
- **Avisar al cliente: vence mañana** (1 día antes).
- **Avisar al cliente: vence hoy** (el mismo día).
- Cada 7 días después del vencimiento, mientras siga impago.

El administrador puede activar, desactivar o cambiar los días de cada regla. **Un mismo aviso no se duplica**: si ya existe para ese caso y esa regla, no se vuelve a crear. Si un certificado se carga cuando ya falta poco, se genera solo el aviso que corresponde a ese momento (por ejemplo, si vence mañana, no aparece también el de "falta una semana").

### 20.2. Cómo usarlos

1. Tocá la **campana** (el número rojo indica cuántos no viste).
2. Cada recordatorio muestra título, fecha e importe.
3. Al **tocarlo**, vas al registro y queda como **Visto**.
4. **Marcar gestionado**: cuando ya te ocupaste, desaparece de la lista.

Estados: **Pendiente** → **Visto** → **Gestionado**.

### 20.3. Avisos de cobro al cliente (WhatsApp o correo)

Sirven para **escribirle al cliente antes de que venza un pago** y recordarle que tiene que pagar. Se generan para:

- **Certificados** con fecha de vencimiento de pago y saldo pendiente.
- **Cauciones** con fecha estimada de liberación y saldo por recuperar.

Se crean **una semana antes**, **un día antes** y **el mismo día** del vencimiento.

**Dónde aparecen**

- En **Inicio**, en la tarjeta **Avisos de cobro para enviar**.
- En la **campana**, con los botones de envío.

**Cómo enviar un aviso**

1. Tocá **WhatsApp**: se abre WhatsApp (web o la aplicación) con el número del cliente y el mensaje ya escrito. Revisalo y tocá enviar.
2. O tocá **Correo**: se abre tu programa de correo con el destinatario, el asunto y el mensaje ya cargados.
3. Con **Ver mensaje** podés leer el texto antes, **copiarlo** y pegarlo donde quieras (por ejemplo, si lo mandás desde otro teléfono).

El mensaje incluye el nombre del contacto, el número de certificado, la obra, la orden de compra, la fecha de vencimiento y el **saldo pendiente actualizado**.

Al tocar WhatsApp o Correo, el aviso queda como **gestionado**, desaparece de la lista y se registra en la **auditoría** quién lo envió y por qué canal. Si el cliente paga antes, los avisos pendientes de ese certificado desaparecen solos.

**Envío automático por correo**

Si el administrador configuró un servidor de correo (ver sección 23.4):

- Los avisos a clientes **con correo cargado** se mandan **solos**, en el horario configurado (por defecto, de 9 a 20 h). No hace falta tocar nada.
- El botón dice **Enviar correo** y lo manda en el momento desde el sistema, sin abrir tu programa de correo.
- En la tarjeta de Inicio quedan solo los avisos que no salieron: clientes sin correo (mandalos por WhatsApp) o envíos que fallaron.
- Cada envío queda en la auditoría como *aviso_cliente*. Si lo mandó el sistema solo, figura con usuario **Sistema** y canal **email_automatico**.
- Si un envío falla, el sistema lo reintenta en la próxima revisión, hasta 3 veces.

**Importante**

- Si no hay servidor de correo configurado, el envío lo hacés vos desde tu WhatsApp o tu correo: el sistema arma el mensaje, pero no lo manda solo.
- WhatsApp siempre se manda a mano desde tu teléfono o WhatsApp Web.
- Si el botón de WhatsApp o de correo no aparece, al cliente le falta el teléfono o el correo. Completalo en su ficha (sección 8.2).

---

## 21. Búsqueda global

En la barra superior (o dentro del menú en el celular):

1. Escribí al menos **2 letras o números**: nombre de cliente, CUIT, nombre de obra, número de OC, número de certificado, referencia de pago, etc.
2. Aparece una lista con el **tipo** de resultado (cliente, obra, orden, certificado, pago, retención, reclamo).
3. Tocá el resultado para abrir su ficha.

---

## 22. Mi perfil y contraseña

Arriba a la derecha → tu nombre → **Perfil y contraseña**:

- **Datos personales**: nombre y apellido, y correo. **Guardar**. Si cambiás el correo, a partir de ese momento iniciás sesión con el nuevo.
- **Cambiar contraseña**: actual, nueva (mínimo 8 caracteres) y repetir. Al cambiarla se cierran tus otras sesiones.

No podés cambiar tu propio rol desde acá.

---

## 23. Administración (solo administradores)

### 23.1. Usuarios

Menú **Administración → Usuarios**.

- **Nuevo usuario**: usuario (mínimo 3 caracteres, es un identificador interno y no se puede cambiar después), nombre, **correo** (es con lo que la persona inicia sesión, y no puede repetirse), **rol** (*Usuario normal* o *Administrador del sistema*), **contraseña inicial** (mínimo 8 caracteres) y si está **activo**. Pasale la contraseña al usuario por un canal seguro y pedile que la cambie.
- **Editar** (lápiz): correo, nombre, rol, activo y, opcionalmente, una **nueva contraseña**. Si cambiás la contraseña o lo desactivás, **se cierran todas sus sesiones** al instante.
- **Desactivar** en vez de borrar: un usuario inactivo no puede entrar, pero su historia se conserva.
- **Eliminar** (papelera): solo si el usuario **no tiene acciones en la auditoría**; si las tiene, el sistema pide desactivarlo.
- **Protección del último administrador**: el sistema no permite eliminar, desactivar ni quitarle el rol al **último administrador activo**.

### 23.2. Configuración

Menú **Administración → Configuración**.

- **Parámetros generales**:
  - *Nombre de la empresa* que se muestra en la aplicación.
  - *Días para considerar una liberación como próxima* (por defecto 30).
  - *Días para alertas críticas de vencimiento* (por defecto 7).

  Cambiar estos valores **no modifica** órdenes ni certificados existentes.
- **Reglas de recordatorios**: para cada regla, activala o desactivala con el interruptor, cambiá los **días de anticipación** o el **repetir cada (días)**, y tocá **✓** para guardar.

### 23.4. Correo automático a clientes

En **Administración → Configuración**, la tarjeta **Correo automático a clientes** muestra:

- Si el envío automático está **activo** o **desactivado**.
- El remitente, el servidor y el horario de envío.
- El botón **Enviarme un correo de prueba**, que manda un correo a tu propia dirección. Usalo después de configurar el servidor para confirmar que funciona.
- Los **últimos envíos**, con destinatario, si fue automático o manual, y el error si falló.

La configuración del servidor de correo **no se cambia desde la pantalla**: va en el archivo `.env` del servidor (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, etc.), porque incluye una contraseña. Después de cambiarlo hay que reiniciar la aplicación.

### 23.3. Auditoría

Menú **Administración → Auditoría**. Es el **registro de todo lo que pasó**: quién hizo qué, cuándo y por qué.

- Columnas: fecha y hora, usuario, registro afectado, acción y motivo.
- Filtro por **tipo de registro** (por ejemplo `certificate`, `payment`, `retention`, `purchase_order`, `user`).
- Tocá una fila para ver el detalle: **motivo**, **impacto** y los valores **antes** y **después** del cambio.

**La auditoría es de solo lectura: nadie puede editarla ni borrarla desde la aplicación**, tampoco un administrador.

---

## 24. Ejemplo completo de principio a fin

Caso: obra **PECAM** del cliente **Constructora Ejemplo S.A.**, orden **OC-TEST-001**: 1.000 m² de un rubro a $ 10.000 el m², caución del 5 % solo sobre la base y liberación 180 días después de terminar la orden.

### Paso 1 — Cliente
*Clientes → Nuevo cliente*: razón social "Constructora Ejemplo S.A.", CUIT, contacto. **Guardar**.

### Paso 2 — Obra
*Obras → Nueva obra*: cliente "Constructora Ejemplo S.A.", nombre "PECAM", estado "En ejecución", fecha de inicio. **Guardar**.

### Paso 3 — Orden de compra
En la obra → pestaña *Órdenes* → **Nueva orden**:
- Número: `OC-TEST-001`. Moneda: ARS.
- Porcentaje retenido: `5`. Base: **Solo importe base certificado**.
- Evento: **Finalización de la orden de compra**. Plazo: `180`.
- **Crear orden**.

### Paso 4 — Rubro
En la OC → **Agregar rubro**: "Piso de hormigón", unidad m², cantidad `1000`, precio `10000`.
→ **Total contratado: $ 10.000.000,00.**

### Paso 5 — Índices CAC
*Índices CAC → Cargar índice*:
- Serie `CAC-GENERAL`, 08/2026, valor `100`.
- Serie `CAC-GENERAL`, 09/2026, valor `120`.

### Paso 6 — Certificado 1 (300 m² con reajuste)
En la OC → **Nuevo certificado**: número `1`, estado *Facturado*, vencimiento del pago a 30 días.
- Rubro: cantidad `300`, reajuste *Variación simple*, índice base 08/2026 (100), índice actualizado 09/2026 (120), estado del reajuste *Aprobado*.

Resultado:

| Concepto | Cálculo | Importe |
|---|---|---|
| Base | 300 × $ 10.000 | $ 3.000.000,00 |
| Coeficiente | 120 ÷ 100 | 1,2 |
| Reajuste CAC | 3.000.000 × 1,2 − 3.000.000 | $ 600.000,00 |
| Bruto | 3.000.000 + 600.000 | $ 3.600.000,00 |
| Base de retención | solo base | $ 3.000.000,00 |
| Caución 5 % | 3.000.000 × 5 % | − $ 150.000,00 |
| **Neto a cobrar** | 3.600.000 − 150.000 | **$ 3.450.000,00** |

La caución de $ 150.000 queda en **Pendiente de fecha de finalización**, porque la orden todavía no terminó. El rubro muestra: certificado 300 m², pendiente 700 m².

### Paso 7 — Certificado 2 (200 m² sin reajuste)
Número `2`, cantidad `200`, sin reajuste:
- Base $ 2.000.000. Caución $ 100.000. **Neto $ 1.900.000**.
- El rubro queda en 500 m² certificados y 500 m² pendientes.

### Paso 8 — Pagos
- El cliente transfiere **$ 3.450.000**. *Pagos → Registrar pago*, aplicación *Neto del certificado* → certificado 1 por $ 3.450.000. El certificado 1 pasa a **Pagado**.
- Luego transfiere **$ 1.000.000** del certificado 2. El certificado 2 pasa a **Parcialmente pagado** (pendiente $ 900.000).

### Paso 9 — Finalización de la orden
Cuando se firma el acta (supongamos el 15/10/2026): OC → **Finalización** → "Esta orden de compra", fecha 15/10/2026 → **Revisar impacto**. Las dos cauciones pasan de "Pendiente" a una liberación el **13/04/2027** (15/10/2026 + 180 días). **Confirmar finalización**.

Ambas cauciones quedan **En plazo**. Al acercarse la fecha pasan a **Próxima a vencer** y empiezan los recordatorios.

### Paso 10 — Reclamo
El 13/04/2027 las cauciones quedan **Habilitadas para reclamar**. *Reclamos → Registrar reclamo*: cliente, marcás las dos cauciones (total $ 250.000), canal correo, próximo seguimiento a 7 días. Las cauciones pasan a **Reclamada**, pero **siguen sumando** en "Cauciones por recuperar".

### Paso 11 — Devolución de la caución
- El cliente devuelve **$ 150.000**: *Registrar pago* con concepto **Devolución de caución** → caución del certificado 1. Esa caución queda **Recuperada**.
- Luego devuelve **$ 60.000** de la otra: queda **Parcialmente recuperada** (pendiente $ 40.000). Cuando llegue el resto, registrás otro pago y queda **Recuperada**.

En el reclamo, cargá cada respuesta con **Registrar gestión** y, cuando esté todo cobrado, cambiá su estado a **Recuperado**.

---

## 25. Reglas que el sistema siempre respeta

1. **No se borra historia financiera**: certificados, pagos, reclamos y retenciones se **anulan** con motivo, no se eliminan.
2. **Aprobado no es pagado**: un certificado solo queda *Pagado* con pagos aplicados.
3. **Reclamado no es cobrado**: una caución solo queda *Recuperada* con un pago de *Devolución de caución*.
4. **Calculado no es aprobado**: un reajuste calculado no se cuenta como aprobado por el cliente.
5. **No se inventan fechas de liberación**: sin hito de finalización (o fecha contractual), la caución queda *Pendiente de fecha*.
6. **No se recalcula en silencio**: cambiar la caución de una OC con certificados emitidos o registrar una finalización muestra el impacto y pide confirmación.
7. **No se certifica de más sin autorización**: superar la cantidad contratada exige autorización y motivo.
8. **No hay doble reajuste**: reajustar algo ya actualizado exige autorización explícita y motivo.
9. **No se cobra de más sin autorización**: aplicar más que el saldo pendiente exige ajuste autorizado y motivo.
10. **No se mezclan monedas**: totales y gráficos siempre por moneda.
11. **Cada certificado guarda su configuración de caución**: lo que estaba vigente al emitirse.
12. **Todo cambio importante queda en la auditoría** con usuario, fecha, motivo e impacto.
13. **Los permisos los controla el servidor**: aunque alguien manipule la pantalla, un usuario normal no puede hacer acciones de administrador.

---

## 26. Tabla de estados

### Certificados
| Estado | Significado |
|---|---|
| Borrador | En preparación; no suma en totales. |
| Presentado | Entregado al cliente. |
| Aprobado | El cliente lo aprobó (todavía no se facturó). |
| Facturado | Se emitió la factura; desde acá cuenta como pendiente de cobro. |
| Parcialmente pagado | *(automático)* Cobrado en parte. |
| Pagado | *(automático)* Neto cobrado completo. |
| Observado | El cliente lo objetó. |
| Anulado | Sin efecto; visible con motivo. |

### Reajustes CAC
| Estado | Significado |
|---|---|
| Calculado | Estimación interna. |
| Presentado | Enviado al cliente. |
| Aprobado | El cliente lo aprobó (pasa a ser oficial). |
| Facturado | Facturado al cliente. |
| Pagado | Cobrado. |
| Rechazado | El cliente no lo aceptó; deja de sumar. |
| Anulado | Sin efecto, con motivo. |
| Reemplazado | Lo sustituyó otro reajuste. |

### Retenciones (cauciones)
Ver la [sección 15.3](#153-estados-de-una-caución-los-calcula-el-sistema).

### Reclamos
| Estado | Significado |
|---|---|
| Pendiente de reclamar | Todavía no se envió. |
| Reclamo enviado | Ya se envió. |
| En seguimiento | Hay gestiones en curso. |
| Fecha de pago prometida | El cliente comprometió una fecha. |
| Parcialmente recuperado | Devolvieron una parte. |
| Recuperado | Devolvieron todo. |
| En disputa | Hay desacuerdo. |
| Anulado | Sin efecto, con motivo. |

### Pagos
| Estado | Significado |
|---|---|
| Registrado | Vigente; sus aplicaciones cuentan. |
| Anulado | Sin efecto; sus aplicaciones dejan de contar. |

### Órdenes de compra
Borrador · Vigente (la única que permite certificar) · Finalizada · Cancelada.

### Obras
Planificación · En ejecución · Finalizada · Suspendida · Cancelada.

---

## 27. Qué puede hacer cada rol

| Acción | Usuario normal | Administrador |
|---|:---:|:---:|
| Ver inicio, calendario, reportes y exportar | ✅ | ✅ |
| Crear y editar clientes, obras y órdenes | ✅ | ✅ |
| Cargar y editar rubros | ✅ | ✅ |
| Eliminar rubros nunca certificados | ❌ | ✅ |
| Eliminar clientes, obras u órdenes sin movimientos | ❌ | ✅ |
| Crear certificados, cambiar estado y fechas | ✅ | ✅ |
| Anular certificados | ✅ | ✅ |
| Reactivar certificados anulados | ❌ | ✅ |
| Eliminar certificados en borrador | ❌ | ✅ |
| Cargar índices CAC | ✅ | ✅ |
| Editar o eliminar índices CAC | ❌ | ✅ |
| Registrar reajustes y cambiar su estado | ✅ | ✅ |
| Registrar, aplicar y anular pagos | ✅ | ✅ |
| Marcar cauciones en disputa y editar observaciones | ✅ | ✅ |
| Anular retenciones | ❌ | ✅ |
| Registrar finalizaciones | ✅ | ✅ |
| Registrar, seguir y anular reclamos | ✅ | ✅ |
| Subir, descargar y eliminar documentos | ✅ | ✅ |
| Gestionar recordatorios propios (visto / gestionado) | ✅ | ✅ |
| Crear, editar, desactivar y eliminar usuarios | ❌ | ✅ |
| Cambiar configuración y reglas de recordatorios | ❌ | ✅ |
| Ver la auditoría y el historial de la obra | ❌ | ✅ |
| Editar o borrar la auditoría | ❌ | ❌ |

---

## 28. Preguntas frecuentes y problemas comunes

**No veo mi orden al crear un certificado.**
Solo aparecen las órdenes en estado *Vigente*. Abrí la OC → **Editar** → Estado *Vigente*.

**Al crear el certificado dice "La orden no tiene rubros activos".**
Cargá primero los rubros en la ficha de la OC ([sección 10.3](#103-cargar-los-rubros-obligatorio-para-poder-certificar)).

**No me deja guardar el certificado porque supera lo contratado.**
Revisá la cantidad. Si realmente corresponde (adicional aprobado), marcá **"Autorizo el excedente"** y escribí el motivo. Si es un aumento permanente, conviene editar la cantidad contratada del rubro.

**El número de certificado ya existe.**
No se puede repetir el número dentro de la misma OC. Si el anterior era un error, anulalo y volvé a cargarlo.

**No aparecen índices en el reajuste.**
Cargalos primero en *Índices CAC*. Revisá que el período y la serie sean los correctos.

**El reajuste da error por índice en cero.**
El índice base debe ser mayor a cero. Corregí el valor en *Índices CAC* (pedíselo a un administrador si ya está cargado).

**La caución dice "Pendiente de fecha de finalización".**
Es correcto mientras no termine lo que inicia el plazo. Cuando termine, registralo con **Registrar finalización** ([sección 16](#16-registrar-la-finalización-de-obra-orden-o-alcance)).

**Reclamé la caución pero sigue en "Cauciones por recuperar".**
Es lo esperado: reclamar no es cobrar. Cuando el cliente pague, registrá un pago con concepto **Devolución de caución**.

**Marqué un certificado como aprobado y no figura como cobrado.**
Aprobado no es pagado. Registrá el pago y aplicalo al certificado.

**No puedo anular un certificado.**
Tiene pagos aplicados. Primero anulá esos pagos (o reasignalos) y después anulá el certificado.

**Al registrar el pago no aparece el certificado.**
Revisá que el certificado sea del mismo cliente, esté en la **misma moneda**, tenga **saldo pendiente** y no esté en *Borrador* ni *Anulado*.

**El pago quedó con saldo "Sin aplicar".**
Abrí el pago → **Aplicar saldo** y distribuilo.

**Cambié la caución de la OC y me pide confirmar un recálculo.**
Es una protección: estás por cambiar certificados ya emitidos. Revisá la lista, escribí el motivo y confirmá solo si el contrato realmente cambió.

**No veo el menú Administración.**
Solo lo ven los administradores.

**Me dice que no puedo eliminar o desactivar un usuario administrador.**
Es el último administrador activo. Creá o activá otro administrador primero.

**No puedo eliminar un usuario.**
Tiene acciones registradas en la auditoría. Desactivalo.

**Se cerró mi sesión sola.**
Pasó el tiempo de sesión, cambiaste la contraseña o un administrador te desactivó o te cambió la contraseña. Volvé a ingresar.

**El archivo no se sube.**
Revisá el tipo (PDF, imágenes, Excel, Word, CSV o TXT) y que no supere los 10 MB.

**Los totales del inicio no coinciden con un reporte.**
Revisá la **moneda** elegida en el inicio y los **filtros** del reporte (cliente, obra, fechas). Las definiciones exactas están en el ícono ⓘ de cada tarjeta.
