/** Drop the nameless, empty part a file input submits when no file was chosen. */
export function withoutEmptyFiles(form: FormData) {
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key);
    if (!values.some((value) => value instanceof File && !value.size)) continue;
    form.delete(key);
    for (const value of values) if (!(value instanceof File) || value.size) form.append(key, value);
  }
}
