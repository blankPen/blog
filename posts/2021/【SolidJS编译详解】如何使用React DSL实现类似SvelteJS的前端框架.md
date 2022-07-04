---
theme: channing-cyan
---
# 前言
由于近期团队技术需要调研如何使用 **React DSL** 实现类似 **SvelteJs** 的**去除vdom+diff**的前端框架，所以才有了以下文章的产生。

> 如果你还不知道什么是 **SvelteJs** ，那说明你已经out了，赶紧爬起来学习吧。

传送门：
- [都快2020年，你还没听说过SvelteJS?](https://zhuanlan.zhihu.com/p/97825481)
- https://github.com/sveltejs/svelte


所以本篇文章我将给大家介绍一下 **SvelteJs** 的实现原理？才怪~

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/81502f1e2fd142e394362e6604837e1a~tplv-k3u1fbpfcp-watermark.image)

本次我要介绍的是另一个前端框架———[**SolidJs**](https://github.com/solidjs/solid)（前端框架已经这么多了么？？？）

关于 **SolidJs** 的介绍大家可以参考掘金大佬的文章[传送门](https://juejin.cn/post/6979955410736267278)，我这里就不过多描述了。

简单来说，**SolidJs** 是借鉴了 SvelteJs 的理念，使用React DSL开发的新框架。（是不是和我前面提到的调研方向非常匹配？大家的思路相当一致嘛）

下面我会针对 **SolidJs** 对他进行详细的拆解。


# 正片

> 因为只是总结，介绍不会特别全面，如果看不懂可能需要先了解一下源码、看看编译前后产物的差距，再结合文章一起食用。

在正式开始之前需要介绍一件事情，无论是 **SvelteJs** 还是 **SolidJs**，他们都有一个最核心的特性——**将声明式代码编译成命令式代码**。这也是我主要要介绍的内容。

什么是声明式代码？
``` jsx
// jsx,html等都是声明式代码，通过声明代码内容让程序自己去解析展示
<div>hello world</div>
```
什么是命令式代码？
``` jsx
// dom api, jquery等这些都是命令式代码，通过调用指令去执行逻辑
const el = document.createElement('div');
el.innerText = 'hello world';
document.body.appendChild(el);
```
那 **SolidJs** 做了什么呢？左边是源码，右边是编译后的代码。[Demo链接](https://playground.solidjs.com/?version=1.1.0#NobwRAdghgtgpmAXGGUCWEwBowBcCeADgsrgM4Ae2YZA9gK4BOAxiWGjIbY7gAQi9GcCABM4jXgF9eAM0a0YvADo1aAGzQiAtACsyAegDucAEYqA3EogcuPfr2ZCouOAGU0Ac2hqps+YpU6DW09CysrGXoIZlw0WgheAGEGCBdGAAoASn4rXgd4sj5gZhTcLF4yOFxkqNwAXV4AXgcnF3cvKDV0gAZMywT8iELeDEc4eFSm3iymgD4KqprU9JLamYBqXgBGPvCBoVwmBPTcvN4AHhN6XFx43gJiRpUrm-iVXnjEjWYAa0aQUZCCa4SSzU5nfirZaZSTgi76F63CBgga7CCwiBWISicTpGaNebnJZpXj6WblES0Zj0YEAOg8VQAompxsJcAAhfAASREJzAUEIhBUmTRYEkdSAA)

![image.png](https://p9-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/4a4fece2a0924d0190706de453d06c9d~tplv-k3u1fbpfcp-watermark.image)

我们先大致扫一眼，接下来会仔细介绍。


## 模块拆解

首先对SolidJs的模块进行拆解，仔细看看主要是以下几个部分：
| 时机 | 模块 | 描述 |
| --- | --- | --- |
| 编译时 | babel-preset-solid  | 就一空壳，一些配置项，主要内容在babel-plugin-jsx-dom-expression |
| 编译时 | babel-plugin-jsx-dom-expression  | 将JSX代码编译成DOM的命令式代码 |
| 运行时 | solid/src/reactive  | reactive的核心代码，主要处理数据的响应式更新逻辑在SolidJS中实现的就是hooks那一套effect，createSignal |
| 运行时 | dom-expressions  |**DOM命令式核心代码**，**与 babel-plugin-jsx-dom-expressions 结合使用**，封装了一些可操作DOM的API，如template，insert，setAttribute，style，addEventListener等|


参考链接：
- **[solid/src/reactive]** https://github.com/solidjs/solid/tree/main/packages/solid/src/reactive
- **[dom-expressions]** https://github.com/ryansolid/dom-expressions/tree/main/packages/dom-expressions
- **[babel-plugin-jsx-dom-expressions]** https://github.com/ryansolid/dom-expressions/tree/main/packages/babel-plugin-jsx-dom-expressions



从模块划分看，主要由两个部分构成：
- **编译时**，主要将React的JSX代码编译成DOM API的命令式代码
- **运行时**，提供一些基础的API以及数据驱动更新的代码

而说到JS中的编译转换那必然就不可避免的会使用到 **Babel**，在 **SolidJs** 中 `babel-plugin-jsx-dom-expressions` 就是干这个事的。

观察源码我们可以发现，主要配置项如下：
```js
{
    exclude: 'node_modules/**',
    babelHelpers: "bundled",
    plugins: [
        [require("babel-plugin-jsx-dom-expressions"), {
            moduleName: 'dom', // 模块名可以自定义
            delegateEvents: false, // 是否使用委托事件，我们应该不需要委托事件
            // contextToCustomElements: true,
            // wrapConditionals: true
        }]
    ]
}
```

## 编译详解

整体的编译流程，如下图所示：

![image.png](https://p6-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/084c0b0ac56a46aa97094c3d142e5a53~tplv-k3u1fbpfcp-watermark.image)

`babel-plugin-jsx-dom-expressions` 入口源码如下，主要是针对 **JSXElement**，**JSXFragment** 进行了转换，其他JS逻辑基本没有处理。
```js
import SyntaxJSX from "@babel/plugin-syntax-jsx";
import { transformJSX } from "./shared/transform";
import postprocess from "./shared/postprocess";
import preprocess from "./shared/preprocess";

export default () => {
  return {
    name: "JSX DOM Expressions",
    inherits: SyntaxJSX,
    visitor: {
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
      Program: {
        enter: preprocess,
        exit: postprocess
      }
    }
  };
};
```

而这其中最重要的就是 `transformElement(path, info)`，他是整个编译过程拆解的核心。
他主要的作用就是通过AST将 **JSXElement** 转换成一个 **Result** 对象，结构如下：
```js
{ 
  template: '<button type="button">before<text></text></button>', // 用来创建节点的模板语句
  decl: // 变量定义宣言
   [ { type: 'VariableDeclarator', id: [Object], init: [Object] },
     { type: 'VariableDeclarator', id: [Object], init: [Object] } ],
  exprs:  // DOM 命令式创建的表达式，包含insert,addEventListener等
   [ { type: 'ExpressionStatement', expression: [Object] },
     { type: 'ExpressionStatement', expression: [Object] },
     { type: 'ExpressionStatement', expression: [Object] } ],
  dynamics: // 涉及到到动态计算相关的属性语句
   [ { elem: [Object],
       key: 'style:width',
       value: [Node],
       isSVG: false,
       isCE: false },
     { elem: [Object],
       key: 'style:height',
       value: [Node],
       isSVG: false,
       isCE: false } ],
  postExprs: [],
  isSVG: false,
  tagName: 'mview', // 标签名称
  id: { type: 'Identifier', name: '_el$2' }, // 这个JSXElement对应在JS中的的变量名
  hasHydratableEvent: false }
```

他将 **JSXElement** 解析成了一个对象，最终会根据这个对象来生成最终输出的 **output代码**；这么说可能有点抽象，我们结合实际产物来对比。

**源代码如下：**
```jsx
class App {
    state = { value: 1 }
    render() {
        return (
            <button 
                type="button" 
                style={{ width: Math.random() * 100, height: Math.random() * 100 }} 
                onClick={Math.random() > 0.5 ? this.increment : null}
            >
                before
                <text>{this.state.value}</text>
                {[1, 2, 3].map(k => <Button key={k} >自定义组件</Button>)}
            </button>
        );
    }
}
```

**编译后产物如下：**
```jsx
import { template, delegateEvents, addEventListener, insert, createComponent, effect } from 'solid-js/web';

const _tmpl$ = template(`<button type="button">before<text></text></button>`, 4);

/* source: main.tsx */
class App {
  state = {
    value: 1
  };

  render() {
    const _self$ = this;

    return (() => {
      const _el$ = _tmpl$.cloneNode(true),
            _el$2 = _el$.firstChild,
            _el$3 = _el$2.nextSibling;

      addEventListener(_el$, "click", Math.random() > 0.5 ? _self$.increment : null, true);

      insert(_el$3, () => _self$.state.value);

      insert(_el$, () => [1, 2, 3].map(k => createComponent(Button, {
        key: k,
        children: "\u81EA\u5B9A\u4E49\u7EC4\u4EF6"
      })), null);

      effect(_p$ => {
        const _v$ = Math.random() * 100,
              _v$2 = Math.random() * 100;

        _v$ !== _p$._v$ && _el$.style.setProperty("width", _p$._v$ = _v$);
        _v$2 !== _p$._v$2 && _el$.style.setProperty("height", _p$._v$2 = _v$2);
        return _p$;
      }, {
        _v$: undefined,
        _v$2: undefined
      });

      return _el$;
    })();
  }

}

delegateEvents(["click"]);
```

根据`transformElement(path, info)`的产物 **Result** 对象结构拆解来看

**Result.template** 对应编译后代码中的 **_temp$**，主要用于创建节点的 **Element** 实例
```js
// { "template": "<button type=\"button\">before<text></text></button>", }
const _tmpl$ = template(`<button type="button">before<text></text></button>`, 4);
```

**Result.decl** 对应编译后代码中的 **_el$** 等节点变量声明
```js
/* 
{ 
    "decl": [{
        "type": "VariableDeclarator",
        "id": { "type": "Identifier", "name": "_el$2" },
        "init": { "type": "MemberExpression",  }
    }, {
        "type": "VariableDeclarator",
        "id": { "type": "Identifier", "name": "_el$3" },
        "init": { "type": "MemberExpression",  }
    }],
}
*/
return (() => {
    const _el$ = _tmpl$.cloneNode(true),
        _el$2 = _el$.firstChild,
        _el$3 = _el$2.nextSibling;4);
    // ...
}
```

**Result.exprs** 对应编译后代码中的 `insert,addEventListener` 等 DOM 创建绑定相关的命令式创建的表达式;
```js
/* 
{ 
    "exprs": [{
        "type": "ExpressionStatement",
        "expression": {
            "type": "CallExpression",
            "callee": { "type": "Identifier", "name": "_$addEventListener" },
            "arguments": [
                { "type": "Identifier", "name": "_el$2" }, 
                { "type": "StringLiteral", "value": "click" }, 
                { "type": "ConditionalExpression" }
            ]
        }
    }, {
        "type": "ExpressionStatement",
        "expression": {
            "type": "CallExpression",
            "callee": { "type": "Identifier", "name": "_$insert" },
            "arguments": [
                { "type": "Identifier", "name": "_el$4" }, 
                { "type": "ArrowFunctionExpression", "params": [], "body": {}, "async": false }
            ]
        }
    }, {
        "type": "ExpressionStatement",
        "expression": {
            "type": "CallExpression",
            "callee": { "type": "Identifier", "name": "_$insert" },
            "arguments": [
                { "type": "Identifier", "name": "_el$2" }, 
                { "type": "ArrowFunctionExpression", "params": [], "body": {}, "async": false }, 
                { "type": "NullLiteral" }
            ]
        }
    }],
}
*/
addEventListener(_el$, "click", Math.random() > 0.5 ? _self$.increment : null, true);
insert(_el$3, () => _self$.state.value);
insert(_el$, () => [1, 2, 3].map(k => createComponent(Button, {
    key: k,
    children: "\u81EA\u5B9A\u4E49\u7EC4\u4EF6"
})), null);
```

**Result.dynamics** 对应编译后代码中的 涉及到到**动态计算相关**的属性语句
```js
/* 
{ 
    "dynamics": [{
        "elem": { "type": "Identifier", "name": "_el$2" },
        "key": "style:width",
        "value": { "type": "BinaryExpression" /*  */ },
        "isSVG": false,
        "isCE": false
    }, {
        "elem": { "type": "Identifier", "name": "_el$2" },
        "key": "style:height",
        "value": { "type": "BinaryExpression" /*  */ },
        "isSVG": false,
        "isCE": false
    }],
}
*/
effect(_p$ => {
    const _v$ = Math.random() * 100,
          _v$2 = Math.random() * 100;

    _v$ !== _p$._v$ && _el$.style.setProperty("width", _p$._v$ = _v$);
    _v$2 !== _p$._v$2 && _el$.style.setProperty("height", _p$._v$2 = _v$2);
    return _p$;
}, {
    _v$: undefined,
    _v$2: undefined
});
```

**Result.tagName**=`button`，标识标签的名称

**Result.id**=`{ "type": "Identifier", "name": "_el$2" }`， 用来当前转换的JSX这个节点最终生成的变量名

最重要的就以上这几个了，其余的就是和HTML特性或者SSR相关的逻辑。

## DOM-Expressions
> **DOM-Expressions** 主要是提供了一些**标准API**提供给 **编译器 jsx-to-dom-expressions 使用**
> **API主要的基础能力依赖于 DOM API**

从上面编译后的代码可以看到，从`solidjs/web`中导入了很多方法
```js
import { template, delegateEvents, addEventListener, insert, createComponent, effect } from 'solid-js/web';
```
比如插入元素的`insert`，根据字符串创建Element的`template`，而这些全都来自 `dom-expressions`这个库，而他底层封装就是**DOM API**。他所有提供的接口如下：

```js
export function render(code, element, init) { }
// 根据模板字符串生成Element
export function template(html, check, isSVG) { }


// ================== 属性相关相关
// 设置属性
export function setAttribute(node, name, value) { }
export function setAttributeNS(node, namespace, name, value) { }

// 获取类名列表
export function classList(node, value, prev = {}) { }
// 设置样式
export function style(node, value, prev = {}) { }


// ================== 事件相关
// 委托事件收集
export function delegateEvents(eventNames, document = window.document) { }
// 清除委托事件收集
export function clearDelegatedEvents(document = window.document) { }
// 注册事件
export function addEventListener(node, name, handler, delegate) { }


// ================== Utils相关
// Utils，合并对象
export function mergeProps(...sources) { }
// 定义动态属性
export function dynamicProperty(props, key) { }

// 将props的所有项赋值到node中
export function assign(node, props, isSVG, skipChildren, prevProps = {}) { }


// ================== dom修改
// TODO
export function spread(node, accessor, isSVG, skipChildren) { }

// 插入node节点到指定位置，如果有需要计算的属性也会开启effect反馈收集
export function insert(parent, accessor, marker, initial) {
    if (marker !== undefined && !initial) initial = [];
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
    effect(current => insertExpression(parent, accessor(), current, marker), initial);
}
// ================== SSR相关
export function hydrate(code, element) { }
export function gatherHydratable(element) { }
export function getNextElement(template) { }
export function getNextMatch(el, nodeName) { }
export function getNextMarker(start) { }
export function runHydrationEvents() { }
export function getHydrationKey() { }
export function Assets() { }
export function NoHydration(props) { }
```



## 总结 
到这基本就是SolidJs转换的核心链路了，主要方式就是通过 **AST** 将 **JSXElement** 进行拆解，主要分解成以下4个部分：
- **template**，节点创建部分，他这里是借助的**innerHTML**属性直接用 **template字符串** 创建节点。
- **decl**，变量定义部分，将可能会用到的 **所有节点（包括子节点）** 的变量声明都定义出来。
- **exprs**，DOM操作部分，根据JSXElement结构按顺序 **插入节点，绑定事件，设置属性** 等。
- **dynamics**，动态计算部分，跟数据变化相关，所有涉及到可能变化的变量都会放在这里，通过`effect`进行绑定。
再结合`dom-expressions`提供的API对Element进行创建绑定操作，实现页面渲染。


# 写在最后
其实到目前为止，我的调研基本已经可以得出结论了——可行。
- **可复用SolidJs的编译流程**，因为`dom-expressions`拆解的非常干净，我只需要按照我环境实现一个类似的API，再改造下 `babel-plugin-jsx-to-dom-expressions` 进行转换；
- **运行时方案无限制**，因为转换逻辑只对JSX进行处理，可以不限制我是否使用 hooks还是class、数据驱动方案我是参考 **solidjs** 还是**Svelte** 还是其他各种都能实现；
- **多平台可移植**，整体框架使用到的就只是最基础的 DOM API，那理论上我只要在对应的平台实现DOM最基础的API（像`kbone`一样）就可以移植到小程序、客户端等其他容器场景；

以上文章主要都是介绍的和编译时相关的内容，至于运行时的逻辑我这里就直接略过了；因为最初目标只是使用JSX实现类似 **SvelteJS** 的框架，而最核心的就是JSX的转换成命令式代码，而数据响应式驱动已经有成千的案例文章供我们参考了。

整篇文档是忙里偷闲挤出来的，写的很草率；只是很久没有特地花时间去解析别人代码了就记录一下，整体的代码难度不是很大，大家花一天时间足以，不过需要提前预备babel等知识储备，感兴趣的可以自行研究研究，还是挺有意思的。


最后在这个内卷圈子还是学点东西提升自我更有价值！祝大家早日晋升。

![image.png](https://p3-juejin.byteimg.com/tos-cn-i-k3u1fbpfcp/2af1d552f4b54d10950e96b980c65b63~tplv-k3u1fbpfcp-watermark.image)
