interface Kv<T = unknown> { [index: string | symbol ]: T; }

// https://fnune.com/typescript/2019/01/30/typescript-series-1-record-is-usually-not-the-best-choice/
type Dictionary<K extends keyof any, T> = Partial<Record<K, T>>

type Many<T> = T | T[]
