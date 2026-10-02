/**
 * Whether a newer copy of the app owns the database (§4.1, #113): it was found newer than this code at open, or a
 * newer copy upgraded it while this one was open. This copy then reads and writes nothing and asks for a reload.
 */
export const outdated = $state({ value: false })
