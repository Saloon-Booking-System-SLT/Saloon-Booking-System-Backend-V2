/**
 * Query Optimizer Utility for Render Free Tier (512MB RAM)
 * Ensures all database queries are memory-efficient and safe
 */

// Pagination constants - safe defaults for low-memory environments
const DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,      // Default page size
  MAX_LIMIT: 50,  // Maximum page size to prevent DoS
  MAX_SKIP: 10000 // Maximum skip value to prevent heavy queries
};

/**
 * Parse and validate pagination parameters
 * @param {Object} query - Request query params
 * @returns {Object} { page, limit, skip }
 */
function getPagination(query) {
  let page = parseInt(query.page) || DEFAULTS.PAGE;
  let limit = parseInt(query.limit) || DEFAULTS.LIMIT;

  // Safety guards
  page = Math.max(1, Math.min(page, 500)); // Max 500 pages
  limit = Math.min(limit, DEFAULTS.MAX_LIMIT); // Cap at MAX_LIMIT
  limit = Math.max(1, limit); // Minimum 1

  const skip = (page - 1) * limit;

  // Prevent unbounded skips
  if (skip > DEFAULTS.MAX_SKIP) {
    page = 1;
    skip = 0;
  }

  return { page, limit, skip };
}

/**
 * Build paginated response metadata
 * @param {Number} total - Total document count
 * @param {Number} page - Current page
 * @param {Number} limit - Items per page
 * @returns {Object} Pagination metadata
 */
function getPaginationMeta(total, page, limit) {
  const pages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    pages,
    hasNextPage: page < pages,
    hasPrevPage: page > 1
  };
}

/**
 * Build optimized field projection
 * @param {String} fields - Comma-separated field names (include minus for exclusion)
 * @returns {String} Mongoose projection string
 */
function getProjection(fields) {
  if (!fields) return '-__v';
  
  // Ensure __v is always excluded
  if (!fields.includes('__v')) {
    fields = fields + ' -__v';
  }
  
  return fields;
}

/**
 * Safe aggregation pipeline builder
 * Ensures $match and $limit are early to reduce memory usage
 * @param {Array} pipeline - Initial pipeline stages
 * @returns {Array} Optimized pipeline
 */
function optimizeAggregationPipeline(pipeline) {
  if (!Array.isArray(pipeline)) {
    return [];
  }

  const stages = {
    match: [],
    sort: null,
    limit: null,
    other: []
  };

  // Separate pipeline stages
  for (const stage of pipeline) {
    if (stage.$match) {
      stages.match.push(stage);
    } else if (stage.$sort) {
      stages.sort = stage;
    } else if (stage.$limit) {
      stages.limit = stage;
    } else {
      stages.other.push(stage);
    }
  }

  // Reconstruct with $match first, $limit early
  const optimized = [];
  
  if (stages.match.length > 0) {
    optimized.push(...stages.match);
  }
  
  if (stages.limit) {
    optimized.push(stages.limit);
  } else {
    // Add default limit if none exists
    optimized.push({ $limit: DEFAULTS.MAX_LIMIT });
  }

  if (stages.sort) {
    optimized.push(stages.sort);
  }

  optimized.push(...stages.other);

  return optimized;
}

/**
 * Build safe query with limits
 * @param {Object} query - MongoDB query object
 * @param {Number} limit - Results limit
 * @returns {Promise<Array>} Results capped at limit
 */
function buildSafeQuery(mongoQuery, limit = DEFAULTS.LIMIT) {
  return mongoQuery
    .limit(Math.min(limit, DEFAULTS.MAX_LIMIT))
    .lean() // Always use .lean() for read-only queries
    .maxTimeMS(10000); // 10 second timeout
}

/**
 * Validate query parameters to prevent heavy queries
 * @param {Object} filters - User-provided filters
 * @returns {Boolean} True if safe
 */
function validateQuerySafety(filters) {
  if (!filters || typeof filters !== 'object') {
    return true;
  }

  const filterStr = JSON.stringify(filters);
  
  // Check for known problematic patterns
  const dangerous = [
    /\$where/i,      // Never use $where
    /function/i,     // No functions in queries
    /eval/i,         // No eval
    /\.length\s*>\s*\d+/i // No large array checks
  ];

  for (const pattern of dangerous) {
    if (pattern.test(filterStr)) {
      console.warn('⚠️ Potentially dangerous query pattern detected:', filterStr);
      return false;
    }
  }

  return true;
}

/**
 * Create a cursor for streaming large datasets
 * @param {Model} mongooseModel - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} options - Cursor options
 * @returns {Cursor} Mongoose cursor for streaming
 */
function createStreamCursor(mongooseModel, filter = {}, options = {}) {
  return mongooseModel.find(filter)
    .lean()
    .batchSize(100) // Process 100 at a time
    .cursor(options);
}

/**
 * Process large dataset with cursor in batches
 * @param {Cursor} cursor - Mongoose cursor
 * @param {Function} processor - Function to process each batch
 * @param {Number} batchSize - Batch size (default 100)
 */
async function processCursorBatches(cursor, processor, batchSize = 100) {
  let batch = [];
  let processed = 0;

  for await (const doc of cursor) {
    batch.push(doc);

    if (batch.length >= batchSize) {
      await processor(batch);
      batch = [];
      processed += batchSize;

      // Allow garbage collection periodically
      if (processed % 500 === 0 && global.gc) {
        global.gc();
      }
    }
  }

  // Process remaining documents
  if (batch.length > 0) {
    await processor(batch);
  }

  return processed;
}

/**
 * Safe find with pagination
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} query - Request query params
 * @param {String} fields - Fields to include/exclude
 * @returns {Promise<Object>} { data, pagination }
 */
async function findPaginated(Model, filter, query, fields) {
  if (!validateQuerySafety(filter)) {
    throw new Error('Invalid query parameters');
  }

  const { page, limit, skip } = getPagination(query);
  const projection = getProjection(fields);

  const [data, total] = await Promise.all([
    Model.find(filter)
      .select(projection)
      .skip(skip)
      .limit(limit)
      .lean()
      .maxTimeMS(10000),
    Model.countDocuments(filter)
  ]);

  return {
    data,
    pagination: getPaginationMeta(total, page, limit)
  };
}

/**
 * Safe findOne with optional field projection
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {String} fields - Fields to include/exclude
 * @returns {Promise<Object|null>} Single document or null
 */
async function findOneSafe(Model, filter, fields) {
  if (!validateQuerySafety(filter)) {
    throw new Error('Invalid query parameters');
  }

  const projection = getProjection(fields);

  return Model.findOne(filter)
    .select(projection)
    .lean()
    .maxTimeMS(5000);
}

/**
 * Safe count with query limits
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @returns {Promise<Number>} Document count
 */
async function countSafe(Model, filter) {
  if (!validateQuerySafety(filter)) {
    throw new Error('Invalid query parameters');
  }

  return Model.countDocuments(filter).maxTimeMS(5000);
}

module.exports = {
  // Constants
  DEFAULTS,
  
  // Pagination
  getPagination,
  getPaginationMeta,
  
  // Projections
  getProjection,
  
  // Aggregations
  optimizeAggregationPipeline,
  
  // Query building
  buildSafeQuery,
  validateQuerySafety,
  
  // Streaming
  createStreamCursor,
  processCursorBatches,
  
  // High-level helpers
  findPaginated,
  findOneSafe,
  countSafe
};
