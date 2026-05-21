/**
 * topo_shim.h — Narrow C ABI for OCCT BREP topology extraction.
 *
 * Called from Rust via FFI. The shim:
 *  1. Reads STEP data from a memory buffer.
 *  2. Extracts faces, edges, wires, and face-edge adjacency.
 *  3. Generates deterministic IDs from topology indices + geometry fingerprints.
 *  4. Returns the result as a JSON string.
 *
 * See ADR 0003 for rationale on keeping this boundary narrow.
 */

#ifndef TOPO_SHIM_H
#define TOPO_SHIM_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/** Opaque handle to an extracted topology result. */
typedef struct TopoResult TopoResult;

/**
 * Import STEP data and extract BREP topology.
 *
 * @param step_data  Pointer to STEP file bytes (ASCII text).
 * @param step_len   Length of step_data in bytes.
 * @return Opaque result handle. NULL only on allocation failure.
 *         Always check topo_result_error() before using topo_result_json().
 *         Caller must free with topo_result_free().
 */
TopoResult* topo_extract(const uint8_t* step_data, size_t step_len);

/**
 * Get the JSON payload string from a successful result.
 *
 * @return NUL-terminated JSON string, or NULL if the extraction failed.
 *         Pointer is valid until topo_result_free() is called.
 */
const char* topo_result_json(const TopoResult* result);

/**
 * Get the error message from a failed result.
 *
 * @return NUL-terminated error string, or NULL if extraction succeeded.
 *         Pointer is valid until topo_result_free() is called.
 */
const char* topo_result_error(const TopoResult* result);

/**
 * Free a result handle and all associated memory.
 *
 * @param result  Handle to free. NULL is safe (no-op).
 */
void topo_result_free(TopoResult* result);

#ifdef __cplusplus
}
#endif

#endif /* TOPO_SHIM_H */
