// Imported first by the CLI. File reads run on libuv's thread pool (4 threads by default);
// a bigger pool roughly halves the first scan of a large projects folder. It only takes
// effect before the pool's first use, and a value the user already set wins.
process.env.UV_THREADPOOL_SIZE ??= '16'

export {}
