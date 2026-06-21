export const FILE_LIMITS = {
  FOTO:      { maxBytes: 5  * 1_048_576, types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'] },
  DOCUMENTO: {
    maxBytes: 10 * 1_048_576,
    // PDF + ofimática (Word/Excel/PowerPoint) + texto/CSV. Debe ir alineado con
    // los `accept` de los inputs de documento. Algunos navegadores reportan
    // file.type vacío para .csv/.txt → se permite '' para no bloquearlos.
    types: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      '',
    ],
  },
  VIDEO:     { maxBytes: 100 * 1_048_576, types: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'] },
  AVATAR:    { maxBytes: 2  * 1_048_576, types: ['image/jpeg', 'image/png', 'image/webp'] },
} as const;

export function validateFile(
  file: File,
  maxBytes: number,
  allowedTypes?: readonly string[],
): string | null {
  if (allowedTypes?.length && !allowedTypes.includes(file.type)) {
    return 'validation.file_type';
  }
  if (file.size > maxBytes) {
    return 'validation.file_size';
  }
  return null;
}
