export function isOwner(user, ownerId, ownerEmail) {
  if(!user?.id||user.is_anonymous)return false;
  if(ownerId)return user.id===ownerId;
  return Boolean(ownerEmail&&user.email_confirmed_at&&typeof user.email==='string'&&user.email.toLowerCase()===ownerEmail.toLowerCase());
}
