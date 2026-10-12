const prisma = require('../db');

// Retry serialization conflicts, keeping read/modify/write decisions inside the transaction.
async function transaction(work) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 10000 });
    } catch (error) {
      if (attempt >= 3 || !['P2034', 'P1008', 'P2028'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
module.exports = { transaction };
