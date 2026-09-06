/**
 * component-labeler.js
 * 8-Connected Component Labeling & Multi-Component Retention Engine.
 * Strict Non-AI Constraint: Never retains only the largest component!
 * Retains all major components, supported medium regions, elongated thin structures and props.
 */
(function(exports) {
  'use strict';

  // Disjoint-set Union-Find
  function UnionFind(size) {
    this.parent = new Int32Array(size);
    for (var i = 0; i < size; i++) this.parent[i] = i;
  }
  UnionFind.prototype.find = function(i) {
    var root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    // Path compression
    var curr = i;
    while (curr !== root) {
      var next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  };
  UnionFind.prototype.union = function(i, j) {
    var rootI = this.find(i);
    var rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  };

  /**
   * 8-connected component labeling on binary or thresholded alpha mask
   * @param {Float32Array|Uint8Array} alphaMap - Alpha values [0..1] or [0..255]
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} [threshold=0.5] - Binary cutoff
   * @returns {object} { labels: Int32Array, components: Array, totalPixels: number }
   */
  function labelComponents(alphaMap, width, height, threshold) {
    threshold = (typeof threshold === 'number') ? threshold : 0.5;
    var totalPixels = width * height;
    var labels = new Int32Array(totalPixels);
    var uf = new UnionFind(Math.floor(totalPixels / 4) + 1024);
    var nextLabel = 1;

    // First pass: label pixels and record equivalences
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var idx = y * width + x;
        var val = alphaMap[idx];
        var isFg = (val >= threshold);
        if (!isFg) continue;

        // Check 8-connected neighbors that have already been visited:
        // (x-1, y-1), (x, y-1), (x+1, y-1), (x-1, y)
        var neighbors = [];

        if (y > 0) {
          if (x > 0 && labels[(y - 1) * width + (x - 1)] > 0) neighbors.push(labels[(y - 1) * width + (x - 1)]);
          if (labels[(y - 1) * width + x] > 0) neighbors.push(labels[(y - 1) * width + x]);
          if (x < width - 1 && labels[(y - 1) * width + (x + 1)] > 0) neighbors.push(labels[(y - 1) * width + (x + 1)]);
        }
        if (x > 0 && labels[y * width + (x - 1)] > 0) {
          neighbors.push(labels[y * width + (x - 1)]);
        }

        if (neighbors.length === 0) {
          labels[idx] = nextLabel;
          nextLabel++;
          if (nextLabel >= uf.parent.length) {
            // Safety: expand UnionFind if needed
            var newUf = new UnionFind(uf.parent.length * 2);
            for (var k = 0; k < uf.parent.length; k++) newUf.parent[k] = uf.parent[k];
            uf = newUf;
          }
        } else {
          var minL = neighbors[0];
          for (var n = 1; n < neighbors.length; n++) {
            if (neighbors[n] < minL) minL = neighbors[n];
            uf.union(neighbors[0], neighbors[n]);
          }
          labels[idx] = minL;
        }
      }
    }

    // Second pass: resolve root labels and gather component statistics
    var compMap = new Map(); // rootLabel -> component object

    for (var y2 = 0; y2 < height; y2++) {
      for (var x2 = 0; x2 < width; x2++) {
        var idx2 = y2 * width + x2;
        var rawLabel = labels[idx2];
        if (rawLabel === 0) continue;

        var root = uf.find(rawLabel);
        labels[idx2] = root;

        var comp = compMap.get(root);
        if (!comp) {
          comp = {
            id: root,
            area: 0,
            minX: x2, maxX: x2,
            minY: y2, maxY: y2,
            sumX: 0, sumY: 0
          };
          compMap.set(root, comp);
        }

        comp.area++;
        comp.sumX += x2;
        comp.sumY += y2;
        if (x2 < comp.minX) comp.minX = x2;
        if (x2 > comp.maxX) comp.maxX = x2;
        if (y2 < comp.minY) comp.minY = y2;
        if (y2 > comp.maxY) comp.maxY = y2;
      }
    }

    var components = [];
    compMap.forEach(function(comp) {
      comp.width = comp.maxX - comp.minX + 1;
      comp.height = comp.maxY - comp.minY + 1;
      comp.centroidX = comp.sumX / comp.area;
      comp.centroidY = comp.sumY / comp.area;
      comp.aspectRatio = comp.width / Math.max(1, comp.height);
      comp.areaRatio = comp.area / totalPixels;
      components.push(comp);
    });

    // Sort components by area descending
    components.sort(function(a, b) { return b.area - a.area; });

    return {
      labels: labels,
      components: components,
      totalPixels: totalPixels
    };
  }

  /**
   * Filter and retain components according to Section 8 multi-component rules
   * Mandatory invariant: NEVER keeps only the largest component!
   * @param {object} labelResult - Result from labelComponents
   * @param {object} thresholds - Configurable area thresholds
   * @param {object} [envelope] - Optional initial group envelope
   * @returns {Set<number>} Set of retained component IDs
   */
  function retainForegroundComponents(labelResult, thresholds, envelope) {
    thresholds = thresholds || {};
    var majorRatio = thresholds.majorAreaRatio || 0.010;
    var mediumRatio = thresholds.mediumAreaRatio || 0.003;
    var smallRatio = thresholds.smallCandidateAreaRatio || 0.0006;
    var noiseRatio = thresholds.noiseAreaRatio || 0.0003;

    var components = labelResult.components;
    var retainedIds = new Set();
    if (components.length === 0) return retainedIds;

    // Step 1: Retain all major components (area >= majorRatio)
    var majorComponents = [];
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (c.areaRatio >= majorRatio) {
        retainedIds.add(c.id);
        majorComponents.push(c);
      }
    }

    // Step 2: If no major component was found (e.g. small image or fragmented),
    // retain at least the top valid components above noise threshold
    if (majorComponents.length === 0) {
      for (var j = 0; j < Math.min(8, components.length); j++) {
        if (components[j].areaRatio >= noiseRatio) {
          retainedIds.add(components[j].id);
          majorComponents.push(components[j]);
        }
      }
    }

    // Step 3: Compute current union bounds of retained major components
    var unionMinX = Infinity, unionMinY = Infinity, unionMaxX = -Infinity, unionMaxY = -Infinity;
    majorComponents.forEach(function(mc) {
      if (mc.minX < unionMinX) unionMinX = mc.minX;
      if (mc.minY < unionMinY) unionMinY = mc.minY;
      if (mc.maxX > unionMaxX) unionMaxX = mc.maxX;
      if (mc.maxY > unionMaxY) unionMaxY = mc.maxY;
    });

    // Expand union bounds by 8% X and 6% Y
    var expX = (unionMaxX - unionMinX) * 0.25;
    var expY = (unionMaxY - unionMinY) * 0.20;
    var searchMinX = Math.max(0, unionMinX - expX);
    var searchMaxX = unionMaxX + expX;
    var searchMinY = Math.max(0, unionMinY - expY);
    var searchMaxY = unionMaxY + expY;

    // Step 4: Inspect medium and small candidates
    for (var k = 0; k < components.length; k++) {
      var cand = components[k];
      if (retainedIds.has(cand.id)) continue;

      // Pure noise exclusion
      if (cand.areaRatio < noiseRatio) continue;

      var isNearGroup = (cand.centroidX >= searchMinX && cand.centroidX <= searchMaxX &&
                         cand.centroidY >= searchMinY && cand.centroidY <= searchMaxY);
      var isVertAligned = (cand.centroidX >= searchMinX && cand.centroidX <= searchMaxX);

      // Elongated thin structure check (hands, arms, legs, straps, ribbons, glasses)
      var isElongated = (cand.aspectRatio > 2.0 || cand.aspectRatio < 0.50);

      // Condition A: Medium component near or aligned with the group
      if (cand.areaRatio >= mediumRatio && (isNearGroup || isVertAligned)) {
        retainedIds.add(cand.id);
        continue;
      }

      // Condition B: Elongated thin structure supported near or vertically aligned with group (Section 7)
      if (cand.areaRatio >= smallRatio && isElongated && (isNearGroup || isVertAligned)) {
        retainedIds.add(cand.id);
        continue;
      }

      // Condition C: Small candidate inside envelope
      if (cand.areaRatio >= smallRatio && isNearGroup) {
        retainedIds.add(cand.id);
        continue;
      }
    }

    return retainedIds;
  }

  /**
   * Filter alpha map to retain only selected components
   * @param {Float32Array} alphaMap - Source alpha map
   * @param {Int32Array} labels - Component label map
   * @param {Set<number>} retainedIds - IDs to keep
   * @returns {Float32Array} Refined alpha map with unselected components set to 0
   */
  function applyRetainedComponents(alphaMap, labels, retainedIds) {
    var length = alphaMap.length;
    var filtered = new Float32Array(length);
    for (var i = 0; i < length; i++) {
      var l = labels[i];
      if (l > 0 && retainedIds.has(l)) {
        filtered[i] = alphaMap[i];
      } else {
        filtered[i] = 0.0;
      }
    }
    return filtered;
  }

  exports.labelComponents = labelComponents;
  exports.retainForegroundComponents = retainForegroundComponents;
  exports.applyRetainedComponents = applyRetainedComponents;

})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ComponentLabeler = {}));
