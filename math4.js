import process from "process";
import { create, all } from 'mathjs';
import random from "random";
let math = create(all, {});

let scenario_metadata = {};
let run_type = '';
let nro_corrida = 0;
let result_nodes = [];
let save_node = [];

let context_now = {};

let ErrorMessage = [];

process.on("message", m => {



    if (!m.finish) {

        scenario_metadata = m.scenario_metadata;
        run_type = m.run_type;
        nro_corrida = m.nro_corrida;



        save_node = scenario_metadata.nodes.map(n => {

            let out = n.outputs.map(o => {

                let comp = o.components.map(c => {

                    return Object.assign({}, { id: c.id, businessObject: c.businessObject }, { data: new Array(scenario_metadata.businessObject.periods) })

                })

                return Object.assign({}, o, { components: comp });

            })

            let dmn = n.dmn_i.map(di => {

                return Object.assign({}, di, { context: null })

            });

            return Object.assign({ context: null }, { id: n.id, parent: n.parent, variables: n.variables, scenario_id: n.scenario_id, businessObject: n.businessObject },
                { outputs: out, dmn: dmn, input_flag: new Array(scenario_metadata.periods).fill(false), passed: new Array(scenario_metadata.periods).fill(false) });


        });



        try {

            save_node.forEach(node => {

                math.node_it(node);

            });

            process.send({ iteration: nro_corrida, type: run_type, nodes: save_node });

        } catch (e) {

            process.send({ error: true, message: ErrorMessage[0] });

        }
    } else {

        process.exit(0)

    }

    // process.send({ iteration: m.nro_corrida, type: m.run_type, nodes: [] });

});

math.import({

    normal: (mu, sigma) => random.normal(mu || 0, sigma || 1)(),

    exponential: lambda => random.exponential(lambda || 1)(),

    poisson: lambda => random.poisson(lambda || 1)(),

    triangular: (l, u, m) => {
        let
            lower = l || 0, upper = u || 1, mode = m || 0.5,
            F = (mode - lower) / (upper - lower),
            U = Math.random();
        return U < F ? (lower + Math.sqrt(U * (upper - lower) * (mode - lower))) :
            (upper - Math.sqrt((1 - U) * (upper - lower) * (upper - mode)))
    },

    node_it: (node) => {

        try {

            console.log('nodo procesado: ', node.businessObject.name)

            for (let t = 0; t < scenario_metadata.businessObject.periods; t++) {

                math.node_time(node, t);

            }

            return true;

        } catch (e) {

            throw e;
        }

    },
    node_time: (node, t) => {

        try {


            if (t < 0) {
                ErrorMessage.push({
                    error: true,
                    type: 'time',
                    message: `Retroceso hasta un tiempo negativo t: "${t}", en el nodo "${node.businessObject.name}"`
                })

                throw new Error(`Retroceso hasta un tiempo negativo t: "${t}", en el nodo "${node.businessObject.name}"`);

            }

            if (!node.input_flag[t]) {

                node.input_flag[t] = true;

                let x = [];
                let dmn = [...node.dmn];
                let context = {};
                let rule = [];

                dmn.forEach(d => {

                    context_now = {};

                    context = math.getContext(d, node.variables);

                    context = Object.assign({}, context, { t: t });

                    context_now = { ...context };

                    rule = math.getRule(d, context, node.businessObject.name);

                    rule.forEach(r => {

                        r.command.forEach(comm => {

                            let comm_data = { ...comm.businessObject };

                            try {
                                math.parse(`${comm_data.expression}`).evaluate({ ...context });
                            } catch (e) {

                                ErrorMessage.push({
                                    error: true,
                                    type: 'expression',
                                    message: `La expresion "${comm_data.expression}" de la tabla ${d.businessObject.name} del nodo "${node.businessObject.name}" no puede ser evaluada`
                                })

                                throw new Error(`La expresion "${comm_data.expression}" de la tabla ${d.businessObject.name} del nodo "${node.businessObject.name}" no puede ser evaluada`);

                            }

                        })

                    })

                });

                node.passed[t] = true;

                return true;

            } else if (node.input_flag[t] && !node.passed[t]) {

                ErrorMessage.push({
                    error: true,
                    type: 'loop',
                    message: `Se ha detectato un bucle para el nodo "${node.businessObject.name}" en el tiempo ${t}`
                })

                throw new Error(`Se ha detectato un bucle para el nodo "${node.businessObject.name}" en el tiempo ${t}`);
            }

            return true;

        } catch (e) {

            throw e;
        }

    },
    getRule: (dmn, context, node_name) => {

        let rules = [];

        rules = dmn.rules.filter(r => {

            let r_data = r.businessObject;

            try {

                if (math.parse(`${r_data.t}`).evaluate(context)) {

                    return math.parse(`${r_data.expression}`).evaluate(context)
                }

            } catch (e) {

                ErrorMessage.push({
                    error: true,
                    type: 'rules',
                    message: `Las reglas que corresponden a la condicion " ${r_data.t} and (${r_data.expression}) ", del nodo "${node_name}" no puede ser evaluada`
                })

                throw new Error(`Las reglas que corresponden a la condicion " ${r_data.t} and (${r_data.expression}) ", del nodo "${node_name}" no puede ser evaluada`);
            }
        })

        return rules

    },
    getContext: (dmn, variables_n) => {


        let node = save_node.find(n => n.id === dmn.node_id);

        let dmn_s = node.dmn.find(d => d.id === dmn.id);

        let bandera1 = false;

        if (node.context === null) {

            bandera1 = true

            node.context = {};

            variables_n.forEach(v => {

                let v_data = { ...v.businessObject };

                try {

                    let ctx = math.evaluate(v_data.expression, node.context);


                    node.context[v_data.symbol] = ctx._data ? ctx._data : ctx;

                } catch (e) {

                    let node_name = node.businessObject.name;

                    ErrorMessage.push({
                        error: true,
                        type: 'context',
                        message: `La variable ${v_data.symbol} cuya expresion es "${v_data.symbol} = ${v_data.expression}", del nodo "${node_name}" no puede ser definida`
                    })
                    throw new Error(`La variable ${v_data.symbol} cuya expresion es "${v_data.symbol} = ${v_data.expression}", del nodo "${node_name}" no puede ser definida`);
                }
            })
        }

        context_now = Object.assign({}, node.context)


        if (dmn_s.context === null) {

            bandera1 = true

            dmn_s.context = {};

            dmn.variables.forEach(v => {

                let v_data2 = { ...v.businessObject };

                try {

                    let ctx2 = math.evaluate(v_data2.expression, context_now);

                    dmn_s.context[v_data2.symbol] = ctx2._data ? ctx2._data : ctx2;

                    context_now = Object.assign({}, context_now, dmn_s.context);

                } catch (e) {

                    let dmn_name = dmn.businessObject.name;

                    ErrorMessage.push({
                        error: true,
                        type: 'context',
                        message: `La variable ${v_data2.symbol} cuya expresion es "${v_data2.symbol} = ${v_data2.expression}", de la tabla "${dmn_name}", del nodo "${node_name}" no puede ser definida`
                    })
                    throw new Error(`La variable ${v_data2.symbol} cuya expresion es "${v_data2.symbol} = ${v_data2.expression}", de la tabla "${dmn_name}", del nodo "${node_name}" no puede ser definida`);
                }
            })
        }

        let context = Object.assign({}, node.context, dmn_s.context);


        if (bandera1) {

            Object.entries(context).forEach(([key, value]) => {
                if (value.assign) {
                    math.reemplace(key, value.data, dmn_s);
                }
            })
        }

        return context;


    },

    reemplace: (symbol, assign, dmn) => {

        try {

            dmn.rules.forEach(r => {

                r.command.forEach(comm => {

                    let comm_data = { ...comm.businessObject };

                    let rg = new RegExp(`${symbol}\\\\left\\([^)]+\\\\right\\)=`, 'g')
                    
                    let rg2 = new RegExp(`(${symbol})\\\\left\\(([^)]+)\\\\right\\)`, 'g')

                    let com_array = comm_data.expression.split(rg)

                    let b64 = Buffer.from(JSON.stringify(assign), 'ascii').toString('base64');

                    if (com_array.length === 2) {

                        let z = com_array[1].match(rg2)

                        if (z != null) {

                            z.forEach(e => {

                                let r = e.match(/^([a-z]+)\\left\(([^ )]+)\\right\)/)

                                com_array[1] = com_array[1].replace(r[0], `get("${Buffer.from(JSON.stringify(Object.assign({}, assign, { t: r[2] })), 'ascii').toString('base64')
                                    }")`)
                            })

                        }

                        com_array[0] = `set("${b64}","${Buffer.from(com_array[1], 'ascii').toString('base64')}")`

                        console.log(comm.businessObject.expression, ' = ', com_array[0])

                        comm.businessObject.expression = com_array[0];

                    } else if (com_array.length === 1) {

                        let se = comm.businessObject.expression

                        let p2 = se.match(/^set\(\s*("[-A-Za-z0-9+/=]+")\s*,\s*("[-A-Za-z0-9+/=]+")\s*\)/)

                        if (p2 != null) {

                            let g = Buffer.from(JSON.stringify(p2[2]), 'base64').toString('ascii');

                            let z = g.match(rg2)

                            if (z != null) {

                                z.forEach(e => {

                                    let r = e.match(/^([a-z]+)\\left\(([^ )]+)\\right\)/)

                                    g = g.replace(r[0], `get("${Buffer.from(JSON.stringify(Object.assign({}, assign, { t: r[2] })), 'ascii').toString('base64')
                                        }")`)

                                    
                                })

                                comm.businessObject.expression = `set(${p2[1]},"${Buffer.from(g, 'ascii').toString('base64')}")`;

                            }

                        }
                        else {

                            let g = comm.businessObject.expression;

                            let z = g.match(rg2)

                            if (z != null) {

                                z.forEach(e => {

                                    let r = e.match(/^([a-z]+)\\left\(([^ )]+)\\right\)/)

                                    g = g.replace(r[0], `get("${Buffer.from(JSON.stringify(Object.assign({}, assign, { t: r[2] })), 'ascii').toString('base64')
                                        }")`)
                                })

                                comm.businessObject.expression = g

                            }

                        }

                    }

                })


            })

        } catch (e) {
            console.error(e);
        }

    },

    set: (obj, exp) => {


        let {
            node_id, output_id, t, x, y, x2, y2
        } = JSON.parse(Buffer.from(obj, 'base64').toString('ascii'));

        exp = Buffer.from(exp, 'base64').toString('ascii');
        x = math.parse(`${x}`).evaluate({ ...context_now })
        y = math.parse(`${y}`).evaluate({ ...context_now })
        x2 = math.parse(`${x2}`).evaluate({ ...context_now })
        y2 = math.parse(`${y2}`).evaluate({ ...context_now })
        t = math.parse(`${t}`).evaluate({ ...context_now })

        let array_b = true;

        let node = save_node.find(n => n.id === node_id);

        let salida = node.outputs.find(o => o.id === output_id);

        try {

            if (t < 0) {
                ErrorMessage.push({
                    error: true,
                    type: 'time',
                    message: `Retroceso hasta un tiempo negativo t: "${t}", en el nodo "${node.businessObject.name}"`
                })

                throw new Error(`Retroceso hasta un tiempo negativo t: "${t}", en el nodo "${node.businessObject.name}"`);

            }


            if (x === null && x2 === null) {
                x = 1;
                x2 = salida.businessObject.dimensions[0];
            } else if (x2 === null) {
                x2 = x
                array_b = false;
            }

            if (y === null && y2 === null) {
                y = 1;
                y2 = salida.businessObject.dimensions[1];
            } else if (y2 === null) {
                y2 = y,
                    array_b = false;
            }

            let result = math.parse(`${exp}`).evaluate({ ...context_now })

            // let result = (exp._data ? exp._data : exp);

            result = (result._data ? result._data : result);

            if (array_b) {


                salida.components.forEach(c => {


                    let corr = c.businessObject.position;

                    if (corr[0] >= x && corr[0] <= x2 &&
                        corr[1] >= y && corr[1] <= y2) {

                        c.data[t] = result[corr[0] - 1][corr[1] - 1];

                    }

                });

            } else {


                let comp = salida.components.find(c => {

                    return c.businessObject.position[0] === x && c.businessObject.position[1] === y

                });

                comp.data[t] = result;

            }




        } catch (e) {

            ErrorMessage.push({
                error: true,
                type: 'set',
                message: `La funcion set, correspondiente al nodo "${node.businessObject.name}" para la salida ${salida.businessObject.name} cuya expresion es ${exp} para el tiempo ${t}, no puede ser evaluada`
            })
            throw new Error(`La funcion set, correspondiente al nodo nodo "${node.businessObject.name}" para la salida ${salida.businessObject.name} cuya expresion es ${exp} para el tiempo ${t}, no puede ser evaluada`);

        }


    },

    get: (obj) => {

        let {
            node_id, output_id, t, x, y, x2, y2
        } = JSON.parse(Buffer.from(obj, 'base64').toString('ascii'));

        x = math.parse(`${x}`).evaluate({ ...context_now })
        y = math.parse(`${y}`).evaluate({ ...context_now })
        x2 = math.parse(`${x2}`).evaluate({ ...context_now })
        y2 = math.parse(`${y2}`).evaluate({ ...context_now })
        t = math.parse(`${t}`).evaluate({ ...context_now })

        let array_b = true;

        let node = save_node.find(n => n.id === node_id);

        let salida = node.outputs.find(o => o.id === output_id);

        try {

            if (t < 0) {
                ErrorMessage.push({
                    error: true,
                    type: 'time',
                    message: `Retroceso hasta un tiempo negativo t: "${t}", en el nodo "${node.businessObject.name}"`
                })

                throw new Error(`Retroceso hasta un tiempo negativo t: "${t}", en el nodo "${node.businessObject.name}"`);

            }

            if (x === null && x2 === null) {
                x = 1;
                x2 = salida.businessObject.dimensions[0];
            } else if (x2 === null) {
                x2 = x
                array_b = false;
            }

            if (y === null && y2 === null) {
                y = 1;
                y2 = salida.businessObject.dimensions[1];
            } else if (y2 === null) {
                y2 = y,
                    array_b = false;
            }

            let result = new Array(x2 - x + 1).fill(new Array(y2 - y + 1).fill(null));

            salida.components.forEach(c => {


                let corr = c.businessObject.position;

                if (corr[0] >= x && corr[0] <= x2 &&
                    corr[1] >= y && corr[1] <= y2) {


                    if (c.data[t] === undefined && node.passed[t]) {

                        ErrorMessage.push({
                            error: true,
                            type: 'get',
                            message: `El subconjunto (${x}:${x2},${y}:${y2}) de la salidad ${salida.businessObject.name} no posee valor para la posicion (${corr[0]},${corr[1]}) en el tiempo ${t}`
                        })

                        throw new Error(`El subconjunto (${x}:${x2},${y}:${y2}) de la salidad ${salida.businessObject.name} no posee valor para la posicion (${corr[0]},${corr[1]}) en el tiempo ${t}`);

                    } else if (c.data[t] === undefined && !node.passed[t]) {

                        math.node_time(node, t);

                        if (c.data[t] === undefined) {

                            ErrorMessage.push({
                                error: true,
                                type: 'get',
                                message: `El subconjunto (${x}:${x2},${y}:${y2}) de la salidad ${salida.businessObject.name} no posee valor para la posicion (${corr[0]},${corr[1]}) en el tiempo ${t}`
                            })

                            throw new Error(`El subconjunto (${x}:${x2},${y}:${y2}) de la salidad ${salida.businessObject.name} no posee valor para la posicion (${corr[0]},${corr[1]}) en el tiempo ${t}`);

                        }

                    }
                    result[corr[0] - x][corr[1] - y] = c.data[t];


                }

            });

            if (!array_b) {

                result = result[0][0]
            }

            return result;

        } catch (e) {

            throw e;

        }

    },

    node_assign(obj) {


        try {

            let {
                node_id, output_id, t, x, y, x2, y2
            } = JSON.parse(Buffer.from(obj, 'base64').toString('ascii'));

            if (isNaN(math.evaluate(t, context_now))) {

                return {
                    assign: true,
                    data: {
                        node_id, output_id, t, x, y, x2, y2
                    }
                }

            } else {

                let exp = `get("${obj}")`

                let result = math.evaluate(exp, context_now)

                return result
            }
        } catch (e) {
            throw e;
        }

    }

});
