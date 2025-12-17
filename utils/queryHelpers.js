/**
 * Query Helpers for Memory-Optimized Database Operations
 * Ensures all queries use pagination, lean(), and proper field projections
 */

// Default pagination settings
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_PAGE = 1;

/**
 * Parse and validate pagination parameters
 * @param {Object} query - Request query object
 * @returns {Object} - Validated pagination params
 */
const getPaginationParams = (query) => {
  let page = parseInt(query.page) || DEFAULT_PAGE;
  let limit = parseInt(query.limit) || DEFAULT_LIMIT;
  
  // Enforce limits
  if (page < 1) page = DEFAULT_PAGE;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
};

/**
 * Build paginated response with metadata
 * @param {Array} data - Result data
 * @param {Number} total - Total count
 * @param {Number} page - Current page
 * @param {Number} limit - Items per page
 * @returns {Object} - Paginated response
 */
const buildPaginatedResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

/**
 * Execute a find query with pagination and optimization
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Paginated results
 */
const paginatedFind = async (Model, filter = {}, options = {}) => {
  const {
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    sort = {},
    select = null,
    populate = null,
    lean = true
  } = options;
  
  const { skip } = getPaginationParams({ page, limit });
  
  // Build query
  let query = Model.find(filter);
  
  // Apply lean for memory efficiency
  if (lean) {
    query = query.lean();
  }
  
  // Apply field selection
  if (select) {
    query = query.select(select);
  }
  
  // Apply sorting
  if (sort && Object.keys(sort).length > 0) {
    query = query.sort(sort);
  }
  
  // Apply pagination
  query = query.skip(skip).limit(limit);
  
  // Apply population if needed
  if (populate) {
    if (Array.isArray(populate)) {
      populate.forEach(pop => query = query.populate(pop));
    } else {
      query = query.populate(populate);
    }
  }
  
  // Execute query and count in parallel
  const [data, total] = await Promise.all([
    query.exec(),
    Model.countDocuments(filter)
  ]);
  
  return buildPaginatedResponse(data, total, page, limit);
};

/**
 * Execute an aggregation with early limits
 * @param {Model} Model - Mongoose model
 * @param {Array} pipeline - Aggregation pipeline
 * @param {Object} options - Options
 * @returns {Promise<Array>} - Aggregation results
 */
const optimizedAggregate = async (Model, pipeline, options = {}) => {
  const { limit = MAX_LIMIT } = options;
  
  // Ensure $match is at the beginning if it exists
  const matchIndex = pipeline.findIndex(stage => stage.$match);
  if (matchIndex > 0) {
    const matchStage = pipeline.splice(matchIndex, 1)[0];
    pipeline.unshift(matchStage);
  }
  
  // Add $limit if not present and no $group or $sort that needs all data
  const hasGroupOrSort = pipeline.some(stage => stage.$group || stage.$sort);
  const hasLimit = pipeline.some(stage => stage.$limit);
  
  if (!hasLimit && !hasGroupOrSort) {
    pipeline.push({ $limit: limit });
  }
  
  return await Model.aggregate(pipeline).exec();
};

/**
 * Safe cursor-based iteration for large datasets
 * @param {Model} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Function} callback - Function to process each document
 * @param {Object} options - Options
 */
const processCursor = async (Model, filter, callback, options = {}) => {
  const {
    batchSize = 100,
    select = null,
    sort = {}
  } = options;
  
  let query = Model.find(filter).lean();
  
  if (select) {
    query = query.select(select);
  }
  
  if (sort && Object.keys(sort).length > 0) {
    query = query.sort(sort);
  }
  
  const cursor = query.cursor({ batchSize });
  
  let count = 0;
  for await (const doc of cursor) {
    await callback(doc);
    count++;
  }
  
  return count;
};

module.exports = {
  getPaginationParams,
  buildPaginatedResponse,
  paginatedFind,
  optimizedAggregate,
  processCursor,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DEFAULT_PAGE
};
