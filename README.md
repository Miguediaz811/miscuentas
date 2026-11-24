# 💰 Mis Cuentas

App web sencilla para llevar las cuentas del salario con **bolsillos** y una **meta de ahorro**.
HTML + CSS + JavaScript puro: sin dependencias, sin servidor, sin build.

## Funciones

- Nómina por conceptos (devengados y deducciones) con neto calculado; cada mes nuevo se carga con un clic desde la última nómina.
- Navegación entre meses.
- Bolsillos por porcentaje del neto (por defecto: Transporte 15 %, Alimentación 30 %, Gastos varios 15 %, Ahorro moto 40 %).
- Registro de gastos e ingresos extra por bolsillo, con filtro y borrado.
- Saldo de cada bolsillo y aviso si sobregiras o si el porcentaje no suma 100 %.
- Meta de ahorro (por defecto: Moto, $3.000.000) que suma el saldo de todos los bolsillos marcados como 💾 ahorro en todos los meses.
- Respaldo: exportar / importar JSON.

Los datos se guardan en `localStorage` del navegador: no salen de tu equipo, pero tampoco se sincronizan entre dispositivos. Exporta respaldos de vez en cuando.

## Uso local

Abre `index.html` en el navegador. Listo.

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "Mis Cuentas: primera versión"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mis-cuentas.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
En un par de minutos queda en `https://TU_USUARIO.github.io/mis-cuentas/`.

## Estructura

```
index.html   # estructura de la interfaz
styles.css   # estilos (responsive, móvil primero)
app.js       # lógica, cálculos y localStorage
```
