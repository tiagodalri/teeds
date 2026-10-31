/**
 * Onde o estúdio guarda as coisas: neste computador (IndexedDB), igual ao
 * OBS, que guarda as cenas e os arquivos na máquina de quem transmite. A
 * configuração e os arquivos enviados (vídeos, músicas, imagens, o stinger)
 * ficam aqui e voltam ao abrir a Central de novo.
 */
import { MARCA } from '../../../marca'
import type { ConfigDoEstudio } from './tipos'

const NOME = `${MARCA.id}-estudio`
let banco: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  banco ??= new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('config')
      r.result.createObjectStore('arquivos')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => { banco = null; falha(r.error) }
  })
  return banco
}

function pedir<T>(loja: 'config' | 'arquivos', modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then((db) => new Promise<T>((ok, falha) => {
    const t = db.transaction(loja, modo)
    const r = f(t.objectStore(loja))
    t.oncomplete = () => ok(r.result as T)
    t.onerror = () => falha(t.error)
    t.onabort = () => falha(t.error)
  }))
}

export const lerConfig = () => pedir<ConfigDoEstudio | undefined>('config', 'readonly', (s) => s.get('atual')).catch(() => undefined)
export const salvarConfig = (c: ConfigDoEstudio) => pedir<void>('config', 'readwrite', (s) => s.put(c, 'atual'))

export interface ArquivoGuardado { nome: string; tipo: string; blob: Blob }
export const guardarArquivo = (id: string, a: ArquivoGuardado) => pedir<void>('arquivos', 'readwrite', (s) => s.put(a, id))
export const lerArquivo = (id: string) => pedir<ArquivoGuardado | undefined>('arquivos', 'readonly', (s) => s.get(id))
export const apagarArquivo = (id: string) => pedir<void>('arquivos', 'readwrite', (s) => s.delete(id)).catch(() => undefined)
export const idsDosArquivos = () => pedir<IDBValidKey[]>('arquivos', 'readonly', (s) => s.getAllKeys()).then((k) => k.map(String)).catch(() => [] as string[])
