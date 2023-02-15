const { create, all } = require('mathjs')
const math = create(all)

math.import({
    myConstant: 42,
    hello: function (name) {
        return 'hello, ' + name + '!'
    }
})

math.import({
    myConstant2: 2,
    hello: function (name) {
        return 'hola, ' + name + '!'
    }
},
    {
        override: true
    }
)

math.import({
    test: function (a, b) {
        let z = math.myConstant + a;
        return { 'a+z': z, result: a + b }
    }
}
)

math.import({
    concatenacion: function (cadena) {

        return `${cadena} eso era `
    }
}
)

console.log(math.evaluate('myConstant + 10')) // 52
console.log(math.evaluate('hello("user")')) // 'hello, user!'

console.log(math.evaluate('myConstant2 + 10')) // 52
console.log(math.evaluate('hello("user")')) // 'hello, user!'


console.log(math.evaluate('test(a,b)', { a: 2, b: 3 }));


console.log(math.evaluate('concatenacion(hello(a))', { a: 'robertito' }))


math.import({ myConstant: 12 },
    {
        override: true
    });

math.import({
    recu: function () {
        if (math.myConstant != 0) {
            math.myConstant = math.myConstant - 1;
            math.recu()
        } else {

            console.log('se logro');
            return math.myConstant
        }
    },

},
    {
        override: true
    }
)

console.log(math.evaluate('recu()'))


// console.log(math.evaluate('myConstant'));

// let context = { a: '[[1,2],[3,4]]', b: '[[max(1,0),1],[1,1]]' };

// Object.keys(context).forEach(key => context[key] = math.evaluate(context[key]));

// // console.log(math.evaluate('a+b',context))

// console.log(math.evaluate('a+b', context))

let context={a:[1,1,1,1],t:1};

console.log(context);

if(math.evaluate('t > 0 and (a==[1,1,1,1])',context)){
    console.log('si')
}
