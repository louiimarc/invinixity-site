// Store original files so each browser can decode them at its own sample rate.
let sampleDatabase;
function openSampleCache() {
    if (!sampleDatabase) sampleDatabase = new Promise((resolve, reject) => {
        const request = indexedDB.open('axelerometric-samples', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    }).catch(error => { sampleDatabase = null; throw error; });
    return sampleDatabase;
}

async function cacheSample(file) {
    const db = await openSampleCache();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(file, sampleKey(file));
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
    });
}

async function restoreSampleCache(context, onFile) {
    const db = await openSampleCache();
    const files = await new Promise((resolve, reject) => {
        const request = db.transaction('files').objectStore('files').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    const failed = [];
    for (const file of files) {
        const key = sampleKey(file);
        if (samples.has(key)) continue;
        try {
            const buffer = await context.decodeAudioData(await file.arrayBuffer());
            if (!samples.has(key)) samples.set(key, buffer);
            onFile?.(file);
        } catch { failed.push(file.name); }
    }
    return failed;
}
