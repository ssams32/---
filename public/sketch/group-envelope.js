/**
 * group-envelope.js
 * Two-Pass Group Envelope Calculation & Spatially-Supported Region Expansion.
 * Invariant: Preserves natural gaps between participants without filling envelope.
 */
(function(exports) {
  'use strict';

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * Compute initial union bounding box of components
   */
  function computeUnionBounds(components, filterIds) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var count = 0;

    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (filterIds && !filterIds.has(c.id)) continue;
      if (c.minX < minX) minX = c.minX;
      if (c.minY < minY) minY = c.minY;
      if (c.maxX > maxX) maxX = c.maxX;
      if (c.maxY > maxY) maxY = c.maxY;
      count++;
    }

    if (count === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, isEmpty: true };
    }

    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      isEmpty: false
    };
  }

  /**
   * Two-pass Group Envelope Builder
   * @param {Array} components - All detected components
   * @param {Set<number>} initialRetainedIds - Initial retained IDs
   * @param {number} imageWidth - Source width
   * @param {number} imageHeight - Source height
   * @param {object} [options] - Expansion options (default 8% X, 6% Y)
   * @returns {object} Final group envelope and updated retained IDs
   */
  function buildGroupEnvelope(components, initialRetainedIds, imageWidth, imageHeight, options) {
    options = options || {};
    var expXRatio = options.expansionX || 0.08; // 8% of width
    var expYRatio = options.expansionY || 0.06; // 6% of height

    // Pass 1: Union bounds of major retained components
    var pass1Bounds = computeUnionBounds(components, initialRetainedIds);
    if (pass1Bounds.isEmpty) {
      return {
        bounds: { minX: 0, minY: 0, maxX: imageWidth - 1, maxY: imageHeight - 1, width: imageWidth, height: imageHeight },
        retainedIds: initialRetainedIds
      };
    }

    // Expand bounds by 8% width and 6% height
    var expX = Math.round(imageWidth * expXRatio);
    var expY = Math.round(imageHeight * expYRatio);

    var expandedMinX = clamp(pass1Bounds.minX - expX, 0, imageWidth - 1);
    var expandedMaxX = clamp(pass1Bounds.maxX + expX, 0, imageWidth - 1);
    var expandedMinY = clamp(pass1Bounds.minY - expY, 0, imageHeight - 1);
    var expandedMaxY = clamp(pass1Bounds.maxY + expY, 0, imageHeight - 1);

    // Pass 2: Inspect candidate components lying within expanded bounds
    var updatedRetainedIds = new Set(initialRetainedIds);

    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (updatedRetainedIds.has(c.id)) continue;

      // Check if centroid or significant portion falls within expanded bounds
      var isInsideExpanded = (c.centroidX >= expandedMinX && c.centroidX <= expandedMaxX &&
                              c.centroidY >= expandedMinY && c.centroidY <= expandedMaxY);

      if (isInsideExpanded && c.areaRatio >= 0.0005) {
        updatedRetainedIds.add(c.id);
      }
    }

    // Recalculate final union bounds encompassing all retained components
    var finalBounds = computeUnionBounds(components, updatedRetainedIds);

    return {
      bounds: finalBounds,
      expandedSearchBounds: {
        minX: expandedMinX,
        minY: expandedMinY,
        maxX: expandedMaxX,
        maxY: expandedMaxY
      },
      retainedIds: updatedRetainedIds
    };
  }

  function isInsideGroupEnvelope(x, y, envelope) {
    if (!envelope) return false;
    return (x >= envelope.minX && x <= envelope.maxX &&
            y >= envelope.minY && y <= envelope.maxY);
  }

  exports.computeUnionBounds = computeUnionBounds;
  exports.buildGroupEnvelope = buildGroupEnvelope;
  exports.isInsideGroupEnvelope = isInsideGroupEnvelope;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.GroupEnvelope = {}));
