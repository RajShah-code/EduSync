const sql = require('../../config/db');
const { resolveClassroomAccess } = require('./connectAccessControl');
const {
  checkUploadRateLimit,
  decodeBase64File,
  uploadBufferToB2,
  getPresignedUrlForKey,
  deleteObjectFromB2,
} = require('./connectB2Upload');

function extFromFilename(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const m = filename.match(/\.[a-zA-Z0-9]+$/);
  return m ? m[0] : '';
}

// POST /connect/classrooms/:classSubjectId/materials — teacher-only, and
// only the teacher who owns THAT classroom. file required (base64 in body,
// same upload flow as C6's assignment attachments).
const createMaterial = async (req, res) => {
  const { classSubjectId } = req.params;
  const { title, file_data, file_filename, file_content_type } = req.body;
  const userId = req.user.id;
  const role = req.user.role;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'title is required' });
  }
  if (!file_data) {
    return res.status(400).json({ message: 'file_data is required' });
  }

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access || !access.isTeacher) {
      return res.status(403).json({ message: 'Only the teacher of this classroom can upload materials' });
    }

    const limit = checkUploadRateLimit(userId);
    if (!limit.allowed) {
      return res.status(429).json({ message: 'Rate limit exceeded. Maximum 5 uploads allowed per hour. Please try again later.' });
    }

    let buffer;
    try {
      buffer = decodeBase64File(file_data);
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || 'Upload failed' });
    }

    const key = `connect-assignments/materials/${classSubjectId}/${userId}-${Date.now()}${extFromFilename(file_filename)}`;
    await uploadBufferToB2(buffer, key, file_content_type);
    limit.record();

    const fileType = file_content_type || extFromFilename(file_filename).replace('.', '') || null;

    const [material] = await sql`
      INSERT INTO connect_materials (class_subject_id, uploader_id, title, file_url, file_type, file_size_bytes)
      VALUES (${classSubjectId}, ${userId}, ${title.trim()}, ${key}, ${fileType}, ${buffer.length})
      RETURNING id, class_subject_id, uploader_id, title, file_type, file_size_bytes, created_at;
    `;

    res.status(201).json({ material });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error', error: err.message });
  }
};

// GET /connect/classrooms/:classSubjectId/materials — any user with access.
// Metadata only — NO baked download link (materials are browsed repeatedly,
// not one-time-delivered, so a link generated once here could expire
// before the student clicks it). Use GET /connect/materials/:id/download
// for the actual link, generated fresh each time.
const listMaterials = async (req, res) => {
  const { classSubjectId } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const access = await resolveClassroomAccess(userId, role, classSubjectId);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const materials = await sql`
      SELECT m.id, m.class_subject_id, m.uploader_id, u.name AS uploader_name, m.title,
        m.file_type, m.file_size_bytes, m.created_at
      FROM connect_materials m
      JOIN users u ON u.id = m.uploader_id
      WHERE m.class_subject_id = ${classSubjectId}
      ORDER BY m.created_at DESC;
    `;

    res.json({ materials });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /connect/materials/:id/download — any user with access to the
// material's classroom. Generates a fresh presigned URL on every call.
const getDownloadLink = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const [material] = await sql`SELECT id, class_subject_id, file_url, title FROM connect_materials WHERE id = ${id}`;
    if (!material) return res.status(404).json({ message: 'Material not found' });

    const access = await resolveClassroomAccess(userId, role, material.class_subject_id);
    if (!access) {
      return res.status(403).json({ message: 'You do not have access to this classroom' });
    }

    const downloadUrl = await getPresignedUrlForKey(material.file_url);
    res.json({ id: material.id, title: material.title, download_url: downloadUrl });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// DELETE /connect/materials/:id — teacher-only, must own the parent
// classroom. Deletes the DB row AND the underlying B2 object — never
// leaves an orphaned file.
const deleteMaterial = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const role = req.user.role;

  try {
    const [material] = await sql`SELECT id, class_subject_id, file_url FROM connect_materials WHERE id = ${id}`;
    if (!material) return res.status(404).json({ message: 'Material not found' });

    const access = await resolveClassroomAccess(userId, role, material.class_subject_id);
    if (!access || !access.isTeacher) {
      return res.status(403).json({ message: 'Only the teacher of this classroom can delete materials' });
    }

    await sql`DELETE FROM connect_materials WHERE id = ${id}`;
    await deleteObjectFromB2(material.file_url);

    res.json({ message: 'Material deleted', id: material.id });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { createMaterial, listMaterials, getDownloadLink, deleteMaterial };
