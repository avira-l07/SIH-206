const prisma = require('../db');

/**
 * Search and list missing person reports
 */
async function getMissingPersons(req, res) {
  try {
    const { query, status } = req.query;
    const where = {};
    if (status) where.status = status.toUpperCase();

    let reports = await prisma.missingPerson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (query) {
      const q = query.toLowerCase().trim();
      reports = reports.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.lastSeenLocation.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }

    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error fetching missing persons:', error);
    res.status(500).json({ error: 'Failed to fetch missing persons' });
  }
}

/**
 * File a missing person report
 */
async function reportMissingPerson(req, res) {
  try {
    const { reportedByName, contactPhone, fullName, age, gender, lastSeenLocation, description, lat, lng } = req.body;

    if (!reportedByName || !contactPhone || !fullName || !lastSeenLocation) {
      return res.status(400).json({
        error: 'Required: reportedByName, contactPhone, fullName, lastSeenLocation',
      });
    }

    const report = await prisma.missingPerson.create({
      data: {
        reportedByName: reportedByName.trim(),
        contactPhone: contactPhone.trim(),
        fullName: fullName.trim(),
        age: age ? parseInt(age) : null,
        gender: gender || null,
        lastSeenLocation: lastSeenLocation.trim(),
        description: description || '',
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        status: 'MISSING',
      },
    });

    res.status(201).json({ message: 'Missing person bulletin registered with emergency services', report });
  } catch (error) {
    console.error('Error filing missing person report:', error);
    res.status(500).json({ error: 'Failed to file missing person report' });
  }
}

/**
 * Update missing person status (e.g. LOCATED or SAFE_AT_SHELTER)
 */
async function updateMissingStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, shelterName } = req.body;

    const valid = ['MISSING', 'LOCATED', 'SAFE_AT_SHELTER'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be: ${valid.join(', ')}` });
    }

    const updated = await prisma.missingPerson.update({
      where: { id: parseInt(id) },
      data: {
        status,
        shelterName: shelterName || null,
      },
    });

    res.status(200).json({ message: `Status updated to ${status}`, report: updated });
  } catch (error) {
    console.error('Error updating missing person status:', error);
    res.status(500).json({ error: 'Failed to update missing person status' });
  }
}

module.exports = {
  getMissingPersons,
  reportMissingPerson,
  updateMissingStatus,
};
