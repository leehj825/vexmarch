// Loads the plain-script simulation into Node and returns the shared VM namespace.
const path = require('path');
const root = path.join(__dirname, '..', 'js');
['data/config', 'sim/rng', 'sim/economy', 'sim/armies', 'sim/war', 'sim/officers', 'sim/ai', 'sim/world', 'sim/commands', 'sim/tick', 'view3d/layout'].forEach(f => require(path.join(root, f + '.js')));
module.exports = globalThis.VM;
