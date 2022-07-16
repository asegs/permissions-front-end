import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, { useNodesState, useEdgesState, MiniMap, Controls} from 'react-flow-renderer';
import dagre from 'dagre';

const initialNodes = [];

const initialEdges = [];

const Home = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [orgName, setOrgName] = useState("test-org");
    const [newNodeName, setNewNodeName] = useState("");
    const [selectedNode, setSelectedNode] = useState("");
    const [selectedEdge, setSelectedEdge] = useState({});
    const [includedNodes, setIncludedNodes] = useState([]);
    const [nodesData,setNodesData] = useState({})

    const listPermissions = useCallback((nodeName) => {
        return fetch("http://localhost:4000/view?org_name=" + orgName + "&name="+nodeName).then(
            res => res.json()
        ).then(
            (body) => {
                return body["results"];
            }
        );
    },[orgName])

    const colorNodes = (nds) => {
        return nds.map(node=>{
            const included = includedNodes.includes(node.id) || includedNodes.length === 0;
            const selected = selectedNode === node.id;
            const data = nodesData[node.id];
            const isLeaf = data && data.additions.length === 0 && data.subtractions.length === 0;
            const bgColor = selected ? "#c5fdc5" : included ? "#faf9f9" : "#d0cece";
            return {...node,style: {backgroundColor: bgColor , color: included ? "#000" : "#6a6868", width: "fit-content", borderColor: included && isLeaf  && includedNodes.length > 0 ? "#c79f01" : "#000"}}
        })
    }

    const positionNodes = (permissions) => {
        const parents = new Set(permissions.filter(perm=>perm.parents.length === 0 && (perm.additions.length > 0 || perm.subtractions.length > 0)).map(perm=>perm.name));
        const g = new dagre.graphlib.Graph();
        g.setGraph({});
        g.setDefaultEdgeLabel(function() { return {}; });
        permissions.forEach(perm=>{
            g.setNode(perm.name,{ label: perm.name,  width: perm.name.length * 6 + 50, height: 100 })
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

    const renderAll = useCallback(() => {
        fetch("http://localhost:4000/load?org_name="+orgName).then(
            res => res.json()
        ).then(
            body => {
                const permissions = body["permissions"];
                const nodeMap = {};
                for (let i = 0 ; i < permissions.length ; i ++ ) {
                    nodeMap[permissions[i].name] = permissions[i];
                }

                setNodesData(nodeMap);
                setNodes(colorNodes(positionNodes(permissions)));
                setEdges(permissions.flatMap(perm => {
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
    },[orgName,setNodesData,setNodes,setEdges,colorNodes,positionNodes]);

    const modifyConnection = useCallback((src,tar,isCreate) => {
        const requestOptions = {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                "org_name": orgName,
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
    },[orgName,renderAll]);



    const onConnect = useCallback((params) => setEdges((_) => {
        modifyConnection(params.source, params.target, true);
    }), [setEdges,modifyConnection]);


    const onNodeClick = useCallback(
        async (_, n) => {
            setSelectedNode(n.id);
            const children = await listPermissions(n.id);
            const parents = getNodeParents(n.id);
            const adjacent = Array.from(new Set([...children,...parents]));
            setIncludedNodes(adjacent);
    },[nodesData,setSelectedNode,listPermissions,setIncludedNodes])

    const onSelectionChange = useCallback((params) => {
        const nodes = params.nodes;
        const edges = params.edges;

        if (nodes.length === 0) {
            setSelectedNode("");
            setIncludedNodes([]);
        }

        if (edges.length === 0) {
            setSelectedEdge("");
        }
    }, [setSelectedNode,setIncludedNodes,setSelectedEdge])

    const getNodeParents = (nodeName) => {
        const parents = nodesData[nodeName].parents;
        if (parents.length === 0) {
            return [nodeName];
        }
        return parents.flatMap(parent=>{
            return [nodeName, ...getNodeParents(parent)]
        })
    }

    const addNode = useCallback(()=> {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "org_name": orgName,
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
    },[orgName,newNodeName,renderAll,setNewNodeName]);

    const deleteNode = useCallback(() => {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "org_name": orgName,
                "name": selectedNode
            })
        };
        fetch('http://localhost:4000/delete', requestOptions)
            .then(_ => {
                renderAll();
                setSelectedNode("")
            })
    },[orgName,selectedNode,renderAll,setSelectedNode]);


    const initOrg = () => {
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "org_name": orgName
            })
        };
        fetch('http://localhost:4000/init', requestOptions)
            .then(_ => {
                renderAll();
            })
    }

    const lightRedrawAll = () => {
        setNodes(colorNodes(nodes));
    }

    useEffect(() => {
        renderAll();
    },[]);

    useEffect(() => {
        lightRedrawAll();
    },[includedNodes])

    return (
        <div style={{ height: 800 }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick = {onNodeClick}
                onEdgeClick = {
                    (_, e) => {
                        setSelectedEdge(e)
                    }
                }
                onSelectionChange = {onSelectionChange}
            >
                <MiniMap />
                <Controls />

                <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 4 }}>
                    <div>
                        <input id="org-name" type="text" name="name" value={orgName} onChange={(e) => {
                            setOrgName(e.target.value);
                        }}/>
                        <button
                            id="load-org"
                            onClick={(_) => renderAll()}
                        >
                            Load organization
                        </button>
                        <button
                            id="init-org"
                            onClick={(_) => initOrg()}
                        >
                            Create organization
                        </button>
                        <br/>
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
