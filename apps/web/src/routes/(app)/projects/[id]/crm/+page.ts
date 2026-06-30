import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// The CRM sidebar entry points at /projects/:id/crm, which has no page of its
// own — the section is split into contacts/companies/deals/tasks sub-pages.
// Land on Contacts (the first sub-nav tab).
export const load: PageLoad = ({ params }) => {
  throw redirect(307, `/projects/${params.id}/crm/contacts`);
};
