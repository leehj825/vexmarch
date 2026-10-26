// Loads the plain-script simulation into Node and returns the shared VM namespace.
const path = require('path');
const root = path.join(__dirname, '..', 'js');
['data/config', 'data/story', 'sim/rng', 'sim/hazards', 'sim/economy', 'sim/armies', 'sim/war', 'sim/officers', 'sim/diplo', 'sim/fog', 'sim/ai', 'sim/world', 'sim/commands', 'sim/tick', 'sim/story', 'view3d/layout'].forEach(f => require(path.join(root, f + '.js')));
module.exports = globalThis.VM;
