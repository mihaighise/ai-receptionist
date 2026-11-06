// Admin routes of the API (mounted at /api/admin by src/api/server.js), used by the admin site
// in web/: list, create, edit and delete businesses, and preview what the receptionist would say.
//
//   GET    /api/admin/options             languages and features to choose from
//   GET    /api/admin/businesses          all businesses, including inactive ones
//   POST   /api/admin/businesses          create one
//   PUT    /api/admin/businesses/:id      replace one's settings
//   DELETE /api/admin/businesses/:id      delete one
//   GET    /api/admin/businesses/:id/number-order   its latest automatic Twilio number order, or null
//   POST   /api/admin/preview             greeting and Claude's instructions for unsaved form values
//
// Invalid input gets a 400 with { error, fields: { column: message } }, so the page can point at
// the field to fix.

import express from 'express';
import { createBusiness, deleteBusiness, listBusinessRows, updateBusiness } from '../../shared/businesses.js';
import { findUserIdByEmail } from '../../shared/users.js';
import { InputError, fieldsForDatabaseError, options, parseBusiness, preview, text } from '../business-input.js';
import { latestNumberOrder } from '../phone-numbers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// owner_email -> the owner's user ID (null when empty). The owner must have signed in once, which
// creates their user.
async function ownerIdFor(body) {
  const email = text(body.owner_email);
  if (!email) return null;
  const id = await findUserIdByEmail(email);
  if (!id) throw new InputError({ owner_email: 'No one has signed in with this email yet.' });
  return id;
}

export const adminRoutes = express.Router();
adminRoutes.use(express.json());

adminRoutes.get('/options', (_req, res) => {
  res.json(options);
});

adminRoutes.get('/businesses', async (_req, res) => {
  res.json(await listBusinessRows());
});

adminRoutes.post('/businesses', async (req, res) => {
  const values = { ...parseBusiness(req.body), owner_id: await ownerIdFor(req.body) };
  res.status(201).json(await createBusiness(values));
});

adminRoutes.put('/businesses/:id', async (req, res) => {
  const values = { ...parseBusiness(req.body), owner_id: await ownerIdFor(req.body) };
  const row = UUID.test(req.params.id) ? await updateBusiness(req.params.id, values) : null;
  if (!row) return res.status(404).json({ error: 'That business no longer exists.' });
  res.json(row);
});

adminRoutes.delete('/businesses/:id', async (req, res) => {
  const deleted = UUID.test(req.params.id) && (await deleteBusiness(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'That business no longer exists.' });
  res.status(204).end();
});

adminRoutes.get('/businesses/:id/number-order', async (req, res) => {
  res.json(UUID.test(req.params.id) ? await latestNumberOrder(req.params.id) : null);
});

// Uses the same code as a real call, on the values in the form (saved or not).
adminRoutes.post('/preview', (req, res) => {
  res.json(preview(parseBusiness(req.body)));
});

// Turns errors into JSON the page can show. Express 5 sends errors thrown in async routes here.
adminRoutes.use((err, _req, res, _next) => {
  if (err instanceof InputError) return res.status(400).json({ error: err.message, fields: err.fields });
  const fields = fieldsForDatabaseError(err);
  if (fields) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  console.error('API error (admin):', err);
  res.status(500).json({ error: 'Something went wrong. See the API server log.' });
});
