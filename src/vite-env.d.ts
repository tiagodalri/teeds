/// <reference types="vite/client" />

// o pdf.js não traz tipos do arquivo do trabalhador (usado no Financeiro, components/financeiro/pdf.ts)
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' { export const WorkerMessageHandler: unknown }
