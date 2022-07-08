import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, { useNodesState, useEdgesState, addEdge, MiniMap, Controls} from 'react-flow-renderer';
import dagre from 'dagre';

const initialNodes = [];

const initialEdges = [];

const Home = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [newNodeName, setNewNodeName] = useState("");
    const [selectedNode, setSelectedNode] = useState("");
    const [selectedEdge, setSelectedEdge] = useState({});



    const onConnect = useCallback((params) => setEdges((_) => {
        modifyConnection(params.source, params.target, true);
    }), []);


    const addNode = () => {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "org_name": "test-org",
                "name": newNodeName,
                "additions": [],
                "subtractions": []
            })
        };
        fetch('http://localhost:4000/add', requestOptions)
            .then(_ => {
                renderAll();
                setNewNodeName("")
            })
    }

    const deleteNode = () => {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "org_name": "test-org",
                "name": selectedNode
            })
        };
        fetch('http://localhost:4000/delete', requestOptions)
            .then(_ => {
                renderAll();
                setSelectedNode("")
            })
    }

    const modifyConnection = (src,tar,isCreate) => {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "org_name": "test-org",
                "from": tar,
                "to": src,
                "is_addition": true,
                "is_create": isCreate
            })
        };
        fetch('http://localhost:4000/edit', requestOptions)
            .then(_ => {
                renderAll();
            })
    }

    const positionNodes = (permissions) => {
        const parents = new Set(permissions.filter(perm=>perm.parents.length === 0 && (perm.additions.length > 0 || perm.subtractions.length > 0)).map(perm=>perm.name));
        const g = new dagre.graphlib.Graph();
        g.setGraph({});
        g.setDefaultEdgeLabel(function() { return {}; });
        permissions.forEach(perm=>{
            g.setNode(perm.name,{ label: perm.name,  width: 144, height: 100 })
        })
        permissions.forEach(perm => {
            perm["parents"].forEach(conn => {
                g.setEdge(perm.name, conn);
            })
        });
        dagre.layout(g);
        let highestTile = 1e9;
        let nodeName = "";
        let invert = false;
        let maxY = -1;
        g.nodes().forEach(node=>{
            const info = g.node(node);
            if (info.y < highestTile) {
                highestTile = info.y;
                nodeName = info.label;
            }
            if (info.y > maxY) {
                maxY = info.y;
            }
        });

        if (!parents.has(nodeName)) {
            invert = true;
        }
        return g.nodes().map(node=>{
            const pos = g.node(node);
            return {
                id: node,
                position: {x: pos.x, y: (invert ? maxY - pos.y + highestTile : pos.y)},
                data: {label:node}
            }
        });
    }

    const renderAll = () => {
        fetch("http://localhost:4000/load?org_name=test-org").then(
            res => res.json()
        ).then(
            body => {
                setNodes(positionNodes(body["permissions"]));
                setEdges(body["permissions"].flatMap(perm => {
                    return perm["parents"].map(conn => {
                        return {
                            id: perm.name + "_to_" + conn,
                            target: perm.name,
                            source: conn,
                            style:{strokeWidth:4}
                        }
                    })
                }))
            }
        )
    }

    useEffect(() => {
        renderAll();
    },[]);

    return (
        <div style={{ height: 800 }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick = {
                    (_, n) => {
                        setSelectedNode(n.id);
                    }
                }
                onEdgeClick = {
                    (_, e) => {
                        console.log(e)
                        setSelectedEdge(e)
                    }
                }
            >
                <MiniMap />
                <Controls />

                <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 4 }}>
                    <div>
                        <input id="node-name" type="text" name="name" value={newNodeName} onChange={(e) => {
                            setNewNodeName(e.target.value);
                        }}/>
                        <button
                            id="add-node"
                            onClick={(event) => addNode()}
                        >
                            Create node
                        </button>
                        <br/>
                        <button
                            id="delete-node"
                            onClick={(e) => deleteNode()}
                        >
                            Delete selected node
                        </button>
                        <br/>
                        <button
                            id="delete-edge"
                            onClick={(_)=>{
                                modifyConnection(selectedEdge.source, selectedEdge.target, false);
                                setSelectedEdge({})
                            }}
                        >
                            Delete selected edge
                        </button>
                    </div>
                </div>
            </ReactFlow>
        </div>
    );
};

export default Home;
