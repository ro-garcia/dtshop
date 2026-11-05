# Contabilidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Entregar el frontend de obligaciones y pagos aprobado.
**Architecture:** Motor de cálculos y repositorio asíncrono en memoria independientes del DOM; interfaz propia integrada en la navegación existente.
**Tech Stack:** HTML, CSS, JavaScript sin dependencias; Node test y Playwright/Edge.
**Spec:** docs/superpowers/specs/2026-11-03-accounting-design.md

## Global Constraints
Sin backend ni persistencia al recargar. Tres obligaciones, dos bancos y tres movimientos iniciales. Comprobantes por selector de archivo. Mantener cambios anteriores del administrador.

## Review Focus
Importes con decimales; pagos que exceden saldo; días 29–31; cuotas parciales frente a abonos extraordinarios; archivos inválidos y errores asíncronos.

## Task 1: Datos y cálculos
Files: accounting-data.js, tests/accounting.test.cjs.
Interfaces: Accounting.createRepository() => list(), createObligation(input), addMovement(input, file); Accounting.balance(obligation, movements), schedule(obligation, movements, month), amount(value).
- [x] Escribir pruebas de desglose, centavos, saldo insuficiente y períodos; ejecutarlas antes del motor.
- [x] Implementar validación, fixtures y repositorio con retornos independientes; pruebas deben pasar con node --test tests/accounting.test.cjs.

## Task 2: Interfaz
Files: accounting.js, accounting.css, admin.html, admin.js, tests/admin.cjs.
- [x] Probar navegación accounting (debe mostrar su sección), formularios y cambios de saldo.
- [x] Crear resumen por moneda, listado filtrable, detalle con cuotas e historial, diálogos y adjuntos.
- [x] Exportar JSON/CSV con esquema documentado, sin blobs ni URLs temporales.
- [x] Verificar cargas, errores y doble envío; pruebas de navegador para móvil/tableta/escritorio.

## Task 3: Verificación y documentación
Files: README.md, docs/accounting-api.md.
- [x] Documentar límites de demo y contrato de integración.
- [x] Ejecutar pruebas Node, navegador, sintaxis y git diff --check; inspeccionar capturas visuales.


## Resultado de ejecución
Implementado directamente en la carpeta actual para conservar los cambios previos aprobados del administrador. Sin commits, publicación ni backend.

Verificación: seis pruebas de dominio, pruebas de navegador de Contabilidad y regresión del administrador; cinco anchos (320, 375, 768, 1024, 1440), inspección de capturas móvil/escritorio, sintaxis JavaScript y diff sin errores de espacios.

Revisión independiente: detectó cuotas futuras después de liquidación. Se reprodujo con una prueba fallida y se corrigió; la revisión focal confirmó la solución y las seis pruebas de dominio pasaron. La decisión conserva la cobertura histórica y reactiva la cuota de referencia si una tarjeta registra nueva deuda.
