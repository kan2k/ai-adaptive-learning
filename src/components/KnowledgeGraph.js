import { useState, useEffect, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DndContext } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";

// Dynamic node sizing based on number of children
const getNodeSize = (childrenCount) => {
  if (childrenCount <= 1) {
    return { width: 220, height: 120 }; // Smallest size
  } else if (childrenCount <= 3) {
    return { width: 250, height: 130 }; // Medium size
  } else if (childrenCount <= 4) {
    return { width: 280, height: 140 }; // Large size (original)
  } else {
    return { width: 340, height: 160 }; // Largest size
  }
};

const horizontalSpacing = 50;
const verticalSpacing = 90;

export function KnowledgeGraph({ knowledgeGraph }) {
  const [nodePositions, setNodePositions] = useState({});
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState(null);

  const [isPanning, setIsPanning] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [manuallyPositionedNodes, setManuallyPositionedNodes] = useState(
    new Set(),
  );
  const containerRef = useRef(null);
  const lastPanPoint = useRef(null);
  const nodeRefs = useRef({});

  const [description, setDescription] = useState("");

  // Initialize node positions with dynamic dimensions
  useEffect(() => {
    if (knowledgeGraph?.nodes && Object.keys(nodePositions).length === 0) {
      const positions = {};

      const layoutNodes = (nodes, parentId = null, level = 0, startX = 0) => {
        const children = nodes.filter((node) => node.parent === parentId);

        if (children.length === 0) return;

        // Calculate total width needed for all children
        let totalChildrenWidth = 0;
        children.forEach((child) => {
          const childSize = getNodeSize(child.children?.length || 0);
          totalChildrenWidth += childSize.width;
        });
        totalChildrenWidth += (children.length - 1) * horizontalSpacing;

        // Calculate the starting position so that children are centered
        const startPosition = startX - totalChildrenWidth / 2;

        let currentX = startPosition;
        children.forEach((node, index) => {
          const nodeSize = getNodeSize(node.children?.length || 0);

          positions[node.id] = {
            x: currentX,
            y:
              level *
                (Math.max(
                  ...children.map(
                    (child) => getNodeSize(child.children?.length || 0).height,
                  ),
                ) +
                  verticalSpacing) +
              100,
          };

          // Recursively layout children
          layoutNodes(
            nodes,
            node.id,
            level + 1,
            currentX + nodeSize.width / 2, // Center of current node
          );

          currentX += nodeSize.width + horizontalSpacing;
        });
      };

      layoutNodes(knowledgeGraph.nodes);
      setNodePositions(positions);
    }
  }, [knowledgeGraph, nodePositions]);

  // Function to center viewport on root node
  const centerOnRootNode = useCallback(() => {
    if (!knowledgeGraph?.nodes || !containerRef.current) return;

    const rootNodes = knowledgeGraph.nodes.filter(
      (node) => node.parent === null,
    );
    if (rootNodes.length === 0) return;

    // Get the first root node position
    const rootNode = rootNodes[0];
    const rootPosition = nodePositions[rootNode.id];

    if (!rootPosition) return;

    // Get container dimensions
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Calculate center of root node
    const rootSize = getNodeSize(rootNode.children?.length || 0);
    const rootCenterX = rootPosition.x + rootSize.width / 2;
    const rootCenterY = rootPosition.y + rootSize.height / 2;

    // Calculate transform to center the root node in the viewport with bottom padding
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2 - 100; // Add 100px padding to bottom

    const newX = centerX - rootCenterX;
    const newY = centerY - rootCenterY;

    setViewTransform({ x: newX, y: newY, scale: 1 });
  }, [knowledgeGraph?.nodes, nodePositions]);

  // Center viewport on root node when positions are first calculated
  useEffect(() => {
    if (
      Object.keys(nodePositions).length > 0 &&
      viewTransform.x === 0 &&
      viewTransform.y === 0
    ) {
      // Use setTimeout to ensure the container ref is available and DOM is rendered
      setTimeout(() => {
        centerOnRootNode();
      }, 100);
    }
  }, [nodePositions, viewTransform.x, viewTransform.y, centerOnRootNode]);

  const handleDragStart = (event) => {
    setIsDragging(true);
    setDraggedNodeId(event.active.id);
  };

  // Helper function to get all descendants of a node (including children, grandchildren, etc.)
  const getAllDescendants = (nodeId) => {
    const descendants = new Set();

    const addDescendants = (id) => {
      const node = knowledgeGraph.nodes.find((n) => n.id === id);
      if (node && node.children) {
        node.children.forEach((childId) => {
          descendants.add(childId);
          addDescendants(childId);
        });
      }
    };

    addDescendants(nodeId);
    return Array.from(descendants);
  };

  const handleDragEnd = (event) => {
    const { active, delta } = event;
    const nodeId = active.id;

    // Get all descendants of the dragged node
    const descendants = getAllDescendants(nodeId);

    // Scale the delta by the current zoom level to get the correct movement
    const scaledDelta = {
      x: delta.x / viewTransform.scale,
      y: delta.y / viewTransform.scale,
    };

    // Update positions for the dragged node and all its descendants
    setNodePositions((prev) => {
      const newPositions = { ...prev };

      // Update the dragged node position
      newPositions[nodeId] = {
        x: (prev[nodeId]?.x || 0) + scaledDelta.x,
        y: (prev[nodeId]?.y || 0) + scaledDelta.y,
      };

      // Update all descendant positions by the same delta
      descendants.forEach((descendantId) => {
        if (prev[descendantId]) {
          newPositions[descendantId] = {
            x: prev[descendantId].x + scaledDelta.x,
            y: prev[descendantId].y + scaledDelta.y,
          };
        }
      });

      return newPositions;
    });

    // Mark the dragged node and all its descendants as manually positioned
    setManuallyPositionedNodes((prev) => {
      const newSet = new Set(prev);
      newSet.add(nodeId);
      descendants.forEach((descendantId) => newSet.add(descendantId));
      return newSet;
    });

    // Reset drag state after a small delay to ensure position update
    setTimeout(() => {
      setIsDragging(false);
      setDraggedNodeId(null);
    }, 10);
  };

  const handleMouseDown = (e) => {
    // Check if we're clicking on a node or its children
    const isClickingOnNode = e.target.closest("[data-draggable]");

    if (!isClickingOnNode) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning && lastPanPoint.current) {
      e.preventDefault();
      e.stopPropagation();
      const deltaX = e.clientX - lastPanPoint.current.x;
      const deltaY = e.clientY - lastPanPoint.current.y;

      setViewTransform((prev) => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));

      lastPanPoint.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    lastPanPoint.current = null;
  };

  const handleZoomIn = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    setViewTransform((prev) => {
      const newScale = Math.min(prev.scale * 1.2, 3);
      const scaleRatio = newScale / prev.scale;

      // Calculate the new position to keep the center point fixed
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;

      return {
        x: newX,
        y: newY,
        scale: newScale,
      };
    });
  };

  const handleZoomOut = () => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.width / 2;
    const centerY = containerRect.height / 2;

    setViewTransform((prev) => {
      const newScale = Math.max(prev.scale / 1.2, 0.3);
      const scaleRatio = newScale / prev.scale;

      // Calculate the new position to keep the center point fixed
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;

      return {
        x: newX,
        y: newY,
        scale: newScale,
      };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY;
    const zoomFactor = delta > 0 ? 0.9 : 1.1;

    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    // Get mouse position relative to the container
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    setViewTransform((prev) => {
      const newScale = Math.max(0.3, Math.min(3, prev.scale * zoomFactor));
      const scaleRatio = newScale / prev.scale;

      // Calculate the new position to keep the mouse point fixed
      const newX = mouseX - (mouseX - prev.x) * scaleRatio;
      const newY = mouseY - (mouseY - prev.y) * scaleRatio;

      return {
        x: newX,
        y: newY,
        scale: newScale,
      };
    });
  };

  const handleReset = () => {
    centerOnRootNode();
  };

  const handleResetLayout = () => {
    setManuallyPositionedNodes(new Set());
    // Force recalculation of all positions
    setNodePositions({});
    // Center viewport after layout reset
    setTimeout(() => {
      centerOnRootNode();
    }, 100);
  };

  const toggleNodeExpansion = (nodeId) => {
    if (!isDragging) {
      setExpandedNodes((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
    }
  };

  // Get all visible nodes (root nodes + expanded children)
  const getVisibleNodes = () => {
    const visibleNodes = [];
    const rootNodes =
      knowledgeGraph?.nodes.filter((node) => node.parent === null) || [];

    const addNodeAndExpandedChildren = (node) => {
      visibleNodes.push(node);

      if (
        expandedNodes.has(node.id) &&
        node.children &&
        node.children.length > 0
      ) {
        node.children.forEach((childId) => {
          const childNode = knowledgeGraph.nodes.find((n) => n.id === childId);
          if (childNode) {
            addNodeAndExpandedChildren(childNode);
          }
        });
      }
    };

    rootNodes.forEach(addNodeAndExpandedChildren);
    return visibleNodes;
  };

  const visibleNodes = getVisibleNodes();

  // Helper to get node center positions
  const getNodeCenter = (nodeId) => {
    const pos = nodePositions[nodeId] || { x: 0, y: 0 };
    const node = knowledgeGraph.nodes.find((n) => n.id === nodeId);
    const nodeSize = getNodeSize(node?.children?.length || 0);
    return {
      x: pos.x + nodeSize.width / 2,
      y: pos.y,
    };
  };

  // Collect all visible parent-child pairs for expanded nodes
  const connectionLines = [];
  for (const node of visibleNodes) {
    if (node.children && expandedNodes.has(node.id)) {
      for (const childId of node.children) {
        const childNode = knowledgeGraph.nodes.find((n) => n.id === childId);
        if (childNode && visibleNodes.includes(childNode)) {
          // Parent bottom center
          const parentPos = nodePositions[node.id] || { x: 0, y: 0 };
          const parentSize = getNodeSize(node.children?.length || 0);
          const parentX = parentPos.x + parentSize.width / 2;
          const parentHeight =
            nodeRefs.current[node.id]?.clientHeight || parentSize.height;
          const parentY = parentPos.y + parentHeight;
          // Child top center
          const childPos = nodePositions[childId] || { x: 0, y: 0 };
          const childSize = getNodeSize(childNode.children?.length || 0);
          const childX = childPos.x + childSize.width / 2;
          const childY = childPos.y;
          // Elbow: vertical down from parent, then horizontal to child, then vertical down 10px
          connectionLines.push({
            points: [
              { x: parentX, y: parentY },
              { x: parentX, y: childY - 20 },
              { x: childX, y: childY - 20 },
              { x: childX, y: childY },
            ],
            key: `${node.id}->${childId}`,
          });
        }
      }
    }
  }

  return (
    <div className="h-full bg-green-500 w-full rounded-[48px] text-xl relative overflow-hidden">
      {/* Grid Background */}
      <svg
        className="absolute inset-0 z-0 pointer-events-none"
        width="100%"
        height="100%"
        style={{
          width: "100%",
          height: "100%",
          left: 0,
          top: 0,
        }}
      >
        <defs>
          <pattern
            id="grid"
            width="50"
            height="50"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="rgba(0, 0, 0, 0.05)"
              strokeWidth="1.5"
            />
          </pattern>
        </defs>
        <g
          transform={`translate(${viewTransform.x},${viewTransform.y}) scale(${viewTransform.scale})`}
        >
          <rect
            x="-10000"
            y="-10000"
            width="20000"
            height="20000"
            fill="url(#grid)"
          />
          {connectionLines.map(({ points, key }) => (
            <polyline
              key={key}
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              opacity="0.7"
            />
          ))}
        </g>
      </svg>
      <div className="z-50 pointer-events-none absolute bottom-6 px-8">
        {description && (
          <div className="text-white text-base bg-black/50 rounded-lg p-4">
            {description}
          </div>
        )}
      </div>
      {/* Controls */}
      <div className="absolute top-6 right-8 z-20 flex gap-2">
        <Button
          onClick={handleZoomIn}
          size="sm"
          variant="secondary"
          className="bg-black/50 hover:bg-black/40 text-white"
        >
          <ZoomIn size={16} />
        </Button>
        <Button
          onClick={handleZoomOut}
          size="sm"
          variant="secondary"
          className="bg-black/50 hover:bg-black/40 text-white"
        >
          <ZoomOut size={16} />
        </Button>
        <Button
          onClick={handleReset}
          size="sm"
          variant="secondary"
          className="bg-black/50 hover:bg-black/40 text-white"
        >
          <Shrink size={16} />
        </Button>
        <Button
          onClick={handleResetLayout}
          size="sm"
          variant="secondary"
          className="bg-black/50 hover:bg-black/40 text-white"
          title="Reset node positions to automatic layout"
        >
          <RotateCcw size={16} />
        </Button>
      </div>

      {/* Pan Container */}
      <div
        ref={containerRef}
        className={cn(
          "w-full h-full relative",
          isPanning ? "cursor-grabbing" : "cursor-grab",
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            className="absolute inset-0"
            style={{
              transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`,
              transformOrigin: "0 0",
            }}
          >
            {/* Nodes */}
            <div className="relative z-10">
              {visibleNodes.map((node) => (
                <DraggableNode
                  key={node.id}
                  node={node}
                  position={nodePositions[node.id] || { x: 0, y: 0 }}
                  knowledgeGraph={knowledgeGraph}
                  isDragging={isDragging}
                  isDragged={draggedNodeId === node.id}
                  isExpanded={expandedNodes.has(node.id)}
                  setDescription={setDescription}
                  onToggleExpansion={toggleNodeExpansion}
                  isManuallyPositioned={manuallyPositionedNodes.has(node.id)}
                  viewTransform={viewTransform}
                  nodeRefs={nodeRefs}
                />
              ))}
            </div>
          </div>
        </DndContext>
      </div>
    </div>
  );
}

function DraggableNode({
  node,
  position,
  knowledgeGraph,
  isDragging,
  isDragged,
  isExpanded,
  onToggleExpansion,
  isManuallyPositioned,
  setDescription,
  viewTransform,
  nodeRefs,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    node: nodeRef,
  } = useDraggable({
    id: node.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x / viewTransform.scale}px, ${transform.y / viewTransform.scale}px, 0)`,
      }
    : undefined;

  const handleNodeClick = (e) => {
    e.stopPropagation();
    if (!isDragging) {
      onToggleExpansion(node.id);
    }
  };

  const hasChildren = node.children && node.children.length > 0;

  return (
    <div
      onMouseEnter={() => setDescription(node.description)}
      onMouseLeave={() => setDescription("")}
    >
      <div
        ref={setNodeRef}
        data-draggable="true"
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
          ...style,
        }}
        {...attributes}
        {...listeners}
      >
        <NodeContent
          node={node}
          knowledgeGraph={knowledgeGraph}
          isDragging={isDragging}
          isDragged={isDragged}
          isExpanded={isExpanded}
          onNodeClick={handleNodeClick}
          isManuallyPositioned={isManuallyPositioned}
          nodeRefs={nodeRefs}
        />
      </div>
      {hasChildren && (
        <div
          style={{
            position: "absolute",
            left:
              position.x + getNodeSize(node.children?.length || 0).width / 2,
            top: nodeRef?.current?.clientHeight
              ? position.y + nodeRef?.current?.clientHeight - 10
              : position.y +
                getNodeSize(node.children?.length || 0).height -
                10,
            display: isDragging ? "none" : "block",
            transform: "translate(-50%, -100%)",
          }}
        >
          <button
            className="cursor-pointer p-1 text-white"
            onClick={handleNodeClick}
            variant="outline"
            size="sm"
          >
            {node.children && node.children.length > 0 && (
              <div className="text-xs text-center mt-2 opacity-70 whitespace-nowrap">
                {isExpanded
                  ? `Hide ${node.children.length} children`
                  : `Click to expand (${node.children.length} children)`}
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function NodeContent({
  node,
  knowledgeGraph,
  isDragging,
  isDragged,
  isExpanded,
  isManuallyPositioned,
  nodeRefs,
}) {
  return (
    <div className="relative flex flex-col items-center justify-center">
      <div
        ref={(el) => {
          if (el) {
            nodeRefs.current[node.id] = el;
          }
        }}
        className={cn(
          "text-white text-sm p-3 cursor-grab active:cursor-grabbing rounded-lg shadow-lg transition-all duration-200",
          "hover:scale-105 hover:shadow-xl",
          "select-none",
          isDragged && "scale-105 rotate-2 shadow-2xl z-50",
          (node.children?.length || 0) <= 1
            ? "border"
            : (node.children?.length || 0) <= 3
              ? "border-2"
              : (node.children?.length || 0) <= 4
                ? "border-2"
                : "border-4",
          isManuallyPositioned
            ? "bg-purple-500 hover:bg-purple-600 border-purple-300"
            : "bg-blue-500 hover:bg-blue-600 border-blue-300",
        )}
        style={{
          transform: isDragged ? "scale(1.1) rotate(2deg)" : "scale(1)",
          transition: isDragging ? "none" : "all 0.2s ease",
          width: `${getNodeSize(node.children?.length || 0).width}px`,
          height: "auto",
          minHeight: `${getNodeSize(node.children?.length || 0).height}px`,
        }}
      >
        <div
          className={cn(
            "font-semibold mb-2 text-center",
            (node.children?.length || 0) <= 1
              ? "text-base"
              : (node.children?.length || 0) <= 3
                ? "text-base"
                : (node.children?.length || 0) <= 4
                  ? "text-lg"
                  : "text-xl",
          )}
        >
          {node.title}
        </div>
        <div className="flex flex-wrap gap-1 justify-center">
          {(node.keyTerms ?? []).map((term) => (
            <div
              key={term}
              className={cn(
                "bg-black/20 px-1 py-0.5 rounded",
                (node.children?.length || 0) <= 1
                  ? "text-xs"
                  : (node.children?.length || 0) <= 3
                    ? "text-xs"
                    : (node.children?.length || 0) <= 4
                      ? "text-xs"
                      : "text-sm",
              )}
            >
              {term}
            </div>
          ))}
        </div>
        {node.children && node.children.length > 0 && (
          <div className="h-[24px]"></div>
        )}
      </div>
    </div>
  );
}
