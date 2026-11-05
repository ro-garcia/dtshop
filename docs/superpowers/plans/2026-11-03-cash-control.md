# Control de caja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Frontend vinculado de ventas, cobros, mensajería, cuentas y gastos.
**Architecture:** Repositorio transaccional en memoria independiente del DOM; vista de caja junto a obligaciones, integración mediante métodos asíncronos y IDs de origen.
**Tech Stack:** HTML/CSS/JavaScript, Node test, Playwright/Edge.
**Spec:** docs/superpowers/specs/2026-11-03-cash-control-design.md

## Global Constraints
Solo frontend, reinicio al recargar, centavos enteros y monedas separadas, sin backend. Conservar catálogo y obligaciones existentes.

## Review Focus
No duplicar cobros ni retenciones; anticipos en destinos distintos; reconstrucción histórica; transferencias neutras; operación fallida sin cambios parciales.

## Task 1: Dominio y datos
- [x] Crear tests/cash.test.cjs con ejemplos de Forza, Fast agrupado, anticipo mixto, gasto y transferencia, rangos y rechazos.
- [x] Implementar cash-data.js: cuentas, ventas/ajustes, cobros, liquidaciones, gastos, transferencias, libro y exportación.
- [x] Ejecutar node --test tests/cash.test.cjs.

## Task 2: Interfaz
- [x] Añadir cash.js/cash.css y navegación de subsecciones en admin.html; catálogo de lectura desde admin.js.
- [x] Construir resumen temporal, cuentas/libro, ventas/detalle/cobros, liquidaciones y formularios.
- [x] Integrar cuotas sin desglose con cuenta de salida; saldo bancario opcional y saldos por actualizar; historiales de papel.

## Task 3: Verificación
- [x] Pruebas de navegador de cobros mixtos, gastos, liquidaciones agrupadas, transferencias, adjuntos y cuotas.
- [x] Pruebas de dominio, regresión admin y cinco anchos de pantalla; inspección visual y revisión independiente.
- [x] Actualizar documentación del contrato y límites del frontend.


## Resultado
Implementación completada en la carpeta actual, conservando los cambios del administrador. Verificación: 12 pruebas Node pasan; suites de navegador de caja, obligaciones y administrador pasan; revisión visual escritorio/móvil y cinco anchos, comprobaciones de sintaxis y git diff --check sin errores.

Revisión independiente: se detectó y corrigió la omisión de campos nuevos en el CSV de obligaciones. Prueba de navegador fallida antes y aprobada después; revisor confirmó la corrección. Los CSV de líneas de venta y asignaciones de liquidación se exportan además como tablas planas para BI.

Decisiones: las comisiones se ingresan como importes reales, sin calculadora porcentual en esta versión. Se admiten PDF además de imágenes en comprobantes de caja. Los antiguos movimientos de obligaciones con desglose siguen compatibles; el formulario vigente solo pide total y saldo bancario opcional. Sin publicación ni commits.
