const prisma = require('../db');

/**
 * Search and list missing person reports
 */
async function getMissingPersons(req, res) {
  try {
    const { query, status } = req.query;
    const validStatuses = ['MISSING', 'LOCATED', 'SAFE_AT_SHELTER'];
    const where = {};
    if (status) {
      const normalized = String(status).toUpperCase();
      if (!validStatuses.includes(normalized)) {
        return res.status(400).json({ error: `Invalid status filter. Allowed: ${validStatuses.join(', ')}` });
      }
      where.status = normalized;
    }

    let reports = await prisma.missingPerson.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (query) {
      const q = String(query).slice(0, 100).toLowerCase().trim();
      reports = reports.filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.lastSeenLocation.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
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

    // Validate phone: only digits, +, -, spaces; min 7, max 20 chars
    const cleanPhone = String(contactPhone).replace(/[^\d+\-\s]/g, '').trim();
    if (cleanPhone.length < 7 || cleanPhone.length > 20) {
      return res.status(400).json({ error: 'contactPhone must be 7–20 valid digits' });
    }

    // Cap string field lengths
    if (String(fullName).trim().length > 200) return res.status(400).json({ error: 'fullName too long (max 200)' });
    if (String(lastSeenLocation).trim().length > 300) return res.status(400).json({ error: 'lastSeenLocation too long (max 300)' });
    if (description && String(description).length > 2000) return res.status(400).json({ error: 'description too long (max 2000)' });

    // Validate optional coordinates
    const parsedLat = typeof lat === 'number' ? lat : null;
    const parsedLng = typeof lng === 'number' ? lng : null;
    if (parsedLat !== null && (parsedLat < -90 || parsedLat > 90)) return res.status(400).json({ error: 'lat out of range' });
    if (parsedLng !== null && (parsedLng < -180 || parsedLng > 180)) return res.status(400).json({ error: 'lng out of range' });

    const report = await prisma.missingPerson.create({
      data: {
        reportedByName: String(reportedByName).trim(),
        contactPhone: cleanPhone,
        fullName: String(fullName).trim(),
        age: age ? parseInt(age) : null,
        gender: gender || null,
        lastSeenLocation: String(lastSeenLocation).trim(),
        description: description ? String(description).trim() : '',
        lat: parsedLat,
        lng: parsedLng,
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
