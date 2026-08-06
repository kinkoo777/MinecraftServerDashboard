// Modpack install job — full implementation lands with the modpack feature.
module.exports = { isRunning: () => false, status: () => ({ running: false }), install: () => { throw new Error('not implemented'); } };
