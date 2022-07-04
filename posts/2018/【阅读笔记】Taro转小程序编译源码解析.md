

[TOC]

## 前言

这篇文章的主要是对`taro/taro-tarnsformer-wx`进行源码解析，对于想要了解Taro或者了解babel的人希望看了能得到一定的启发。

由于我文笔实在太烂，所以整篇文章都是以阅读笔记的形式展示，希望能对想了解taro编译但是不太了解babel的人提供一个学习途径。
如果有已经充分了解babel编译的的大佬可以直接去看我fork的taro，在里面我写上了全部注释希望能够帮助到你~~

3在开始讲解前你需要准备一下事情：

- 从github上clone下来taro的代码  [Taro](https://github.com/NervJS/taro) / [Taro-transformer-wx注释版](https://github.com/blankPen/taro-transformer-wx)
- 最起码要知道babel是啥
- 打开 https://astexplorer.net/ ,这是个ast在线转换的网站，如果有不理解的地方直接粘贴代码看结构
- 打开网易云播放一首好听的音乐（文章可能有点枯燥，听歌能缓解心情）

## 开始

### 目录

首先我们进入目录结构能看到下面这堆东西

- taro-tarnsformer-wx/src
    - plugins/
    - adapter.ts
    - class.ts
    - constant.ts
    - create-html-element.ts
    - eslint.ts
    - index.ts
    - interface.d.ts
    - jsx.ts
    - lifecycle.ts
    - loop-component.ts
    - options.ts
    - plugins.ts
    - render.ts
    - utils.ts

然而我们真正主要关注的只有三个文件

- taro-tarnsformer-wx/src
    - index.ts
    - class.ts
    - render.ts

### index.ts

我们先整体来分析下index.ts

```ts
export default function transform (options: Options): TransformResult {
    // ... -> 设置一些参数
    // 如果是 typescript 代码使用 ts.transpile 转换为 esnext 代码
    const code = options.isTyped
        ? ts.transpile(options.code, {
        jsx: ts.JsxEmit.Preserve, // 保留jsx语法
        target: ts.ScriptTarget.ESNext,
        importHelpers: true,
        noEmitHelpers: true
        })
        : options.code
    // babel的第一步，将 js 代码转换成 ast 语法树
    const ast = parse(code, {
        parserOpts: {
        sourceType: 'module',
        plugins: [ ]
        },
        plugins: []
    }).ast as t.File
    //... -> 定义一些变量
    // babel的第二步，遍历语法树，并对语法树做出修改
    traverse(ast, {
        //... -> **转换第一步的核心**
    });
    //... -> 一些简单的处理
    /**
     * **转换第二步的核心**
     * 对 ast 做了更进一步的处理
     * 同时生产了模板文件，也就是 wxml
     */
    result = new Transformer(mainClass, options.sourcePath, componentProperies).result
    // 通过generate将语法树转换成js，这就是最终小程序用的js代码
    result.code = generate(ast).code
    result.ast = ast
    result.compressedTemplate = result.template
    result.template = prettyPrint(result.template, {
        max_char: 0
    })
    result.imageSrcs = Array.from(imageSource)
    return result
}
```

### 转换第一步核心

先简单了解下用到的配置项的意义，有点多，咱一个一个讲

```ts
traverse(ast, {
  // 模板字符串
  TemplateLiteral (path) {},
  // 类的宣言
  ClassDeclaration (path) {},
  // 类表达式
  ClassExpression (path) {},
  // 类的函数
  ClassMethod (path) {},
  // if语句
  IfStatement (path) {},
  // 调用表达式
  CallExpression (path) {},
  // JSX元素
  JSXElement (path) {},
  // JSX开合元素
  JSXOpeningElement (path) {},
  // JSX属性
  JSXAttribute (path) {},
  // 导入宣言
  ImportDeclaration (path) {},
})
```

我们从代码由上往下的方式一个一个来看

首先看对导入语句的处理

```ts
ImportDeclaration (path) {
  const source = path.node.source.value
    if (importSources.has(source)) {
      throw codeFrameError(path.node, '无法在同一文件重复 import 相同的包。')
    } else {
      importSources.add(source)
    }
    const names: string[] = []
    // TARO_PACKAGE_NAME = '@tarojs/taro'
    if (source === TARO_PACKAGE_NAME) {
    /**
    * 如果文件中有import xx from '@tarojs/taro'
    * 会自动帮你多导入一些辅助函数
    * import xx, {
    *  internal_safe_get,
    *  internal_get_orignal,
    *  internal_inline_style,
    *  getElementById
    * } from '@tarojs/taro'
    * 
    */
    isImportTaro = true
    path.node.specifiers.push(
      t.importSpecifier(t.identifier(INTERNAL_SAFE_GET), t.identifier(INTERNAL_SAFE_GET)),
      t.importSpecifier(t.identifier(INTERNAL_GET_ORIGNAL), t.identifier(INTERNAL_GET_ORIGNAL)),
      t.importSpecifier(t.identifier(INTERNAL_INLINE_STYLE), t.identifier(INTERNAL_INLINE_STYLE)),
      t.importSpecifier(t.identifier(GEL_ELEMENT_BY_ID), t.identifier(GEL_ELEMENT_BY_ID))
    )
  }


  // REDUX_PACKAGE_NAME = '@tarojs/redux'
  // MOBX_PACKAGE_NAME = '@tarojs/mobx'
  if (
  source === REDUX_PACKAGE_NAME || source === MOBX_PACKAGE_NAME
  ) {
    path.node.specifiers.forEach((s, index, specs) => {
      if (s.local.name === 'Provider') {
        /**
            * 找到 import { Provider } from 'xxx'
            * 替换成
            * import { setStore } from 'xxx'
            */
        // 删除引入参数Provider
        specs.splice(index, 1)
        // 添加引入参数setStore
        specs.push(
            t.importSpecifier(t.identifier('setStore'), t.identifier('setStore'))
        )
      }
    })
  }
  /**
  * 1.遍历当前import语句收集所有导入的变量名
  * 2.将 import { Component } from '@tarojs/taro'
  * 替换成 import { __BaseComponent } from '@tarojs/taro'
  */
  path.traverse({
    ImportDefaultSpecifier (path) {
      const name = path.node.local.name
      DEFAULT_Component_SET.has(name) || names.push(name)
    },
    ImportSpecifier (path) {
      const name = path.node.imported.name
      DEFAULT_Component_SET.has(name) || names.push(name)
      if (source === TARO_PACKAGE_NAME && name === 'Component') {
        path.node.local = t.identifier('__BaseComponent')
      }
    }
  })
  componentSourceMap.set(source, names)
}
```

接着看对类的定义处理

```ts
ClassDeclaration (path) {
  // 将找到的类的节点存起来，其实这里可以看出，taro默认一个文件只有一个 class
  mainClass = path
  /**
   * 下面这里的目的其实就是当你引用了自定义的组件并且继承了他，这是taro需要把你继承的这个源码也进行编译
   */
  const superClass = path.node.superClass
  // 先判断这个类必须是有继承的 也就是 class A extends XXX {}
  if (t.isIdentifier(superClass)) {
    const binding = path.scope.getBinding(superClass.name)
    // 再判断这个被继承的XXX在之前已经声明过
    if (binding && binding.kind === 'module') {
      const bindingPath = binding.path.parentPath
      // 第三步判断这个声明语句是导入宣言
      if (bindingPath.isImportDeclaration()) {
        /**
          * 此时匹配到的代码是这样
          * import XXX from 'xxx';
          * class A extends XXX {}
          */
        const source = bindingPath.node.source
        try {
          // 这里 p = 'xxx.js' || 'xxx.tsx'
          const p = fs.existsSync(source.value + '.js') ? source.value + '.js' : source.value + '.tsx'
          const code = fs.readFileSync(p, 'utf8')
          // 如果xxx.js存在就对它也再进行一次 transform 转换
          componentProperies = transform({
            isRoot: false,
            isApp: false,
            code,
            isTyped: true,
            sourcePath: source.value,
            outputPath: source.value
          }).componentProperies
        } catch (error) {
          // 文件 xxx.js || xxx.tsx 不存在
        }
      }
    }
  }
},
ClassExpression (path) {
  mainClass = path as any
},
ClassMethod (path) {
  if (t.isIdentifier(path.node.key) && path.node.key.name === 'render') {
    // 找到render函数节点存起来
    renderMethod = path
  }
},
```

再来看看对if语句和函数调用的处理

```ts
// 调用表达式
// func() this.func() arr.map(()={}) 只要有函数调用都算
CallExpression (path) {
  const callee = path.get('callee')
  // isContainJSXElement 这里是遍历的 path 的所有子节点看里面有没有JSXElement，如果有啥都不处理
  if (isContainJSXElement(path)) {
    return
  }
  // 被调用者的引用是成员表达式
  // this.func() arr.map()
  if (callee.isReferencedMemberExpression()) {
    /**
      * 找到被调用者的成员中最靠前的一个标识符
      * 如：
      * this.func() => id 就是 this
      * arr.map() => id 就是 arr
      */
    const id = findFirstIdentifierFromMemberExpression(callee.node)
    /**
      * getIdsFromMemberProps就是找到调用者的所有成员的 name
      * a.b.c.d()  => calleeIds = ['a','b','c','d'];
      */
    const calleeIds = getIdsFromMemberProps(callee.node)
    if (t.isIdentifier(id) && id.name.startsWith('on') && Adapters.alipay !== Adapter.type) {
      // 到了这一步被调用者的代码应该是 onXXXX.xxx() || onXXXX.xxx.xxx();
      /**
        * 解释下buildFullPathThisPropsRef，大概如下
        * 如果：
        * const onXXX = this.props.xxx;
        * onXXX.call(this, arg1, arg2);
        * --- 编译后,此时 fullPath 有值
        * this.props.xxx();
        * 
        * const onXXX = other;
        * onXXX.call(this, arg1, arg2);
        * --- 编译后,此时 fullPath 为空
        * onXXX();
        */
      const fullPath = buildFullPathThisPropsRef(id, calleeIds, path)
      if (fullPath) {
        path.replaceWith(
          t.callExpression(
            fullPath,
            path.node.arguments
          )
        )
      }
    }
  }
  // 被调用者的引用是标识符
  // func()
  if (callee.isReferencedIdentifier()) {
    const id = callee.node
    const ids = [id.name]
    if (t.isIdentifier(id) && id.name.startsWith('on')) {
      // 到了这一步被调用者的代码应该是 onXXXX();
      // 之后的处理和上面一样
      const fullPath = buildFullPathThisPropsRef(id, ids, path)
      if (fullPath) {
        path.replaceWith(
          t.callExpression(
            fullPath,
            path.node.arguments
          )
        )
      }
    }
  }
},
```

好了，接下来是重头戏，对JSX的处理
```ts
JSXElement (path) {
  /**
    * 下面这块代码是有bug的，不太重要，可以忽略
    * 本意可见 => https://github.com/NervJS/taro/issues/550
    * 
    * 实际结果如下：
    * let a; a = [1,2,3].map(v => <View>{v}</View>);
    * --- 编译后
    * let a = <View>{v}</View>;
    * --- 期望结果
    * let a = [1,2,3].map(v => <View>{v}</View>);
    */
  const assignment = path.findParent(p => p.isAssignmentExpression())
  if (assignment && assignment.isAssignmentExpression()) {
    const left = assignment.node.left
    if (t.isIdentifier(left)) {
      const binding = assignment.scope.getBinding(left.name)
      if (binding && binding.scope === assignment.scope) {
        if (binding.path.isVariableDeclarator()) {
          // 错误的点其实就是不应该将path.node 直接赋值给 binding.path.node.init
          // 改成 binding.path.node.init = assignment.node.right 即可
          binding.path.node.init = path.node
          assignment.remove()
        } else {
          throw codeFrameError(path.node, '同一个作用域的JSX 变量延时赋值没有意义。详见：https://github.com/NervJS/taro/issues/550')
        }
      }
    }
  }
  /**
    * 如果是在 switch case 中的JSX会把 switch case切换成 if else
    * switch (v){ 
    * case 1: {
    *  any = <View1/>
    * }
    * case 2: { 
    *  <View2/>
    *  break;
    * }
    * default: {
    *  return <View3/>
    * }
    * }
    * --- 编译后
    * if(v === 1) { any = <View1/> }
    * else if(v === 2) { <View2/> }
    * else { return <View3/> }
    */
  const switchStatement = path.findParent(p => p.isSwitchStatement())
  if (switchStatement && switchStatement.isSwitchStatement()) {
    const { discriminant, cases } = switchStatement.node
    const ifStatement = cases.map((Case, index) => {
      const [ consequent ] = Case.consequent
      /**
        * 校验switch case 必须包含 {}
        * 所以不支持以下写法
        * case 1:
        * case 2: 
        *  return <View/>
        */
      if (!t.isBlockStatement(consequent)) {
        throw codeFrameError(switchStatement.node, '含有 JSX 的 switch case 语句必须每种情况都用花括号 `{}` 包裹结果')
      }
      const block = t.blockStatement(consequent.body.filter(b => !t.isBreakStatement(b)))
      if (index !== cases.length - 1 && t.isNullLiteral(Case.test)) {
        throw codeFrameError(Case, '含有 JSX 的 switch case 语句只有最后一个 case 才能是 default')
      }
      const test = Case.test === null ? t.nullLiteral() : t.binaryExpression('===', discriminant, Case.test)
      return { block, test }
    }).reduceRight((ifStatement, item) => {
      if (t.isNullLiteral(item.test)) {
        ifStatement.alternate = item.block
        return ifStatement
      }
      const newStatement = t.ifStatement(
        item.test,
        item.block,
        t.isBooleanLiteral(ifStatement.test, { value: false })
          ? ifStatement.alternate
          : ifStatement
      )
      return newStatement
    }, t.ifStatement(t.booleanLiteral(false), t.blockStatement([])))

    switchStatement.insertAfter(ifStatement)
    switchStatement.remove()
  }

  // 对for/for in/for of 进行禁用
  const isForStatement = (p) => p && (p.isForStatement() || p.isForInStatement() || p.isForOfStatement())

  const forStatement = path.findParent(isForStatement)
  if (isForStatement(forStatement)) {
    throw codeFrameError(forStatement.node, '不行使用 for 循环操作 JSX 元素，详情：https://github.com/NervJS/taro/blob/master/packages/eslint-plugin-taro/docs/manipulate-jsx-as-array.md')
  }
  /**
    * 处理 Array.prototype.map
    * 将 arr.map((v)=> v) 变成 arr.map((v)=> { return v; })
    */
  const loopCallExpr = path.findParent(p => isArrayMapCallExpression(p))
  if (loopCallExpr && loopCallExpr.isCallExpression()) {
    const [ func ] = loopCallExpr.node.arguments
    // 必须是箭头函数 并且没有 {}
    if (t.isArrowFunctionExpression(func) && !t.isBlockStatement(func.body)) {
      func.body = t.blockStatement([
        t.returnStatement(func.body)
      ])
    }
  }
},

/**
 * JSX开合元素
 * <View></View> -> JSXOpeningElement = <View>, JSXClosingElement = </View>
 * <View/> -> JSXOpeningElement = <View>, JSXClosingElement = null
 */
JSXOpeningElement (path) {
  const { name } = path.node.name as t.JSXIdentifier
  /**
    * 找到<Provider />组件和store属性
    * 将组件改为View, 移除所有属性 
    * 
    * 这里很尬，taro只修改了 OpeningElement,没有处理CloseElement
    * 所以转换 <Provider store={store} >xxxx</Provider> => <View>xxxx</Provider>
    * 但是因为最后会转成wxml所以也没影响
    */
  if (name === 'Provider') {
    const modules = path.scope.getAllBindings('module')
    const providerBinding = Object.values(modules).some((m: Binding) => m.identifier.name === 'Provider')
    if (providerBinding) {
      path.node.name = t.jSXIdentifier('View')
      // 从<Provider store={myStore} >上找属性store，并且拿到传给store的值的名字
      const store = path.node.attributes.find(attr => attr.name.name === 'store')
      if (store && t.isJSXExpressionContainer(store.value) && t.isIdentifier(store.value.expression)) {
        // storeName = 'myStore'
        storeName = store.value.expression.name
      }
      path.node.attributes = []
    }
  }
  // IMAGE_COMPONENTS = ['Image', 'CoverImage']
  // 收集所有图片组件的src值，注意: 只能是字符串
  if (IMAGE_COMPONENTS.has(name)) {
    for (const attr of path.node.attributes) {
      if (
        attr.name.name === 'src'
      ) {
        if (t.isStringLiteral(attr.value)) {
          imageSource.add(attr.value.value)
        } else if (t.isJSXExpressionContainer(attr.value)) {
          if (t.isStringLiteral(attr.value.expression)) {
            imageSource.add(attr.value.expression.value)
          }
        }
      }
    }
  }
},

// 遍历JSX的属性 也就是 <View a={1} b={any} /> 上的 a={1} b={any}
JSXAttribute (path) {
  const { name, value } = path.node
  // 过滤 name非 jsx关键字 或者 value 是 null、字符串、JSXElement
  // 即 any={null} any='123' any={<View />}
  if (!t.isJSXIdentifier(name) || value === null || t.isStringLiteral(value) || t.isJSXElement(value)) {
    return
  }

  const expr = value.expression as any
  const exprPath = path.get('value.expression')

  // 这里是向父级找类的名称 class Index {} -> classDeclName = 'Index';
  // 然后根据classDeclName来判断是否已经转换过
  const classDecl = path.findParent(p => p.isClassDeclaration())
  const classDeclName = classDecl && classDecl.isClassDeclaration() && safeGet(classDecl, 'node.id.name', '')
  let isConverted = false
  if (classDeclName) {
    isConverted = classDeclName === '_C' || classDeclName.endsWith('Tmpl')
  }

  /**
    * 处理内连样式
    * 将style={{ color: 'red' }} => style={internal_inline_style({ color: 'red' })}
    * 这里taro在全局上注入了一个函数 internal_inline_style
    */
  // 判断是style属性，且未转换过，正常来说我们写的代码都是未转换的，加这个逻辑应该是给taro内部一写组件使用
  if (!t.isBinaryExpression(expr, { operator: '+' }) && !t.isLiteral(expr) && name.name === 'style' && !isConverted) {
    const jsxID = path.findParent(p => p.isJSXOpeningElement()).get('name')
    if (jsxID && jsxID.isJSXIdentifier() && DEFAULT_Component_SET.has(jsxID.node.name)) {
      exprPath.replaceWith(
        t.callExpression(t.identifier(INTERNAL_INLINE_STYLE), [expr])
      )
    }
  }

  /**
    * 处理 onXxx 事件属性
    */
  if (name.name.startsWith('on')) {
    /**
      * 这里判断 onClick属性 他的值 是[引用表达式]
      * 即 onClick={myAdd}
      * 
      * 将 const myAdd = this.props.add; <Button onClick={myAdd} />
      * 转换成 <Button onClick={this.props.add} />
      */
    if (exprPath.isReferencedIdentifier()) {
      const ids = [expr.name]
      const fullPath = buildFullPathThisPropsRef(expr, ids, path)
      if (fullPath) {
        exprPath.replaceWith(fullPath)
      }
    }

    /**
      * 这里判断 onClick属性 他的值 是[引用成员表达式]
      * 即 onClick={a.add}
      * 
      * 下面这里的意思应该跟上面差不多
      * 将 const a = this.props; <Button onClick={a.add} />
      * 转换成 <Button onClick={this.props.add} />
      * 
      * 然而 const a = { add: this.props.add }; <Button onClick={a.add} />
      * 这种他就GG了
      */
    if (exprPath.isReferencedMemberExpression()) {
      const id = findFirstIdentifierFromMemberExpression(expr)
      const ids = getIdsFromMemberProps(expr)
      if (t.isIdentifier(id)) {
        const fullPath = buildFullPathThisPropsRef(id, ids, path)
        if (fullPath) {
          exprPath.replaceWith(fullPath)
        }
      }
    }

    // @TODO: bind 的处理待定
  }
},
```
> 细心的同学肯定发现漏掉了 **TemplateLiteral** 没讲，其实这里就是对模板语法做处理，可以忽略掉

看到这里Taro编译的第一步就讲解完成了~~

如果你看懂了那你对babel编译已经有了一个初步的了解，接下来的内容可以加快节奏了~

### 转换第二步核心

还记的是第二步是啥么~帮你回忆一下~~
```ts
import { Transformer } from './class'
/**
  * 分析下参数
  * mainClass 第一步收集到的类的节点
  * options.sourcePath 代码文件的根路径（外面传进来的）
  * componentProperies 不重要，具体看 第一步的 ClassDeclaration 
  */
result = new Transformer(mainClass, options.sourcePath, componentProperies).result
```

然后我们就来到了要将的第二个文件class.ts
> 惊不惊险，刺不刺激，已经讲完1/3了呢！！！

国际惯例，先看构造函数

非常简单，一堆赋值咱不关心，然后调用了this.compile(),所以玄机应该就在compile中
```ts
constructor (
  path: NodePath<t.ClassDeclaration>,
  sourcePath: string,
  componentProperies: string[]
) {
  this.classPath = path
  this.sourcePath = sourcePath
  this.moduleNames = Object.keys(path.scope.getAllBindings('module'))
  this.componentProperies = new Set(componentProperies)
  this.compile()
}
```

compile长成下面这样，大概描述下各个函数的功能
```ts
compile () {
  // 遍历，各种遍历，在遍历的过程中做了一堆有一堆的修改
  this.traverse()
  // 把遍历过程中收集到的自定义组件存到this.result.components，跟编译没啥关系可忽略
  this.setComponents()
  // 处理构造函数将constructor改成_constructor
  this.resetConstructor()
  // 收集到更多使用的props
  this.findMoreProps()
  // 对ref进行处理
  this.handleRefs()
  // 大家最关心的一步，将jsx 编译成wxml
  this.parseRender()
  this.result.componentProperies = [...this.componentProperies]
}
```

关于**this.traverse**，这里我不是很想讲，因为太多了，有兴趣的可以去看我加上注释的代码,这里我会省略掉很多代码

```ts
traverse () {
  const self = this
  self.classPath.traverse({
    JSXOpeningElement: (path) => {
      // ...
      // 是不是在map循环中
      const loopCallExpr = path.findParent(p => isArrayMapCallExpression(p))
      const componentName = jsx.name.name
      // 找到ref属性
      const refAttr = findJSXAttrByName(attrs, 'ref')
      if (!refAttr) { return }
      // 找到id属性
      const idAttr = findJSXAttrByName(attrs, 'id')
      // 随机生成id
      let id: string = createRandomLetters(5)
      let idExpr: t.Expression
      if (!idAttr) {
        /**
          * 这里是处理如果tag上没有 id 属性时自动添加上 id=randomStr
          * 如果在map循环中 id = randomStr + index
          */   
          if (loopCallExpr && loopCallExpr.isCallExpression()) {
            // ...
          } else {
            // ...
          }
      } else {
        // 有id属性，找到id属性的值或者表达式
        const idValue = idAttr.value
        if (t.isStringLiteral(idValue)) {
          // ...
        } else if (t.isJSXExpressionContainer(idValue)) {
          // ...
        }
      }

      // 如果ref属性是字符串且不在循环中，则添加StringRef
      // ref="myRef"
      if (t.isStringLiteral(refAttr.value)) {
        // ...
      }
      // 如果ref属性是jsx表达式 // ref={any}
      if (t.isJSXExpressionContainer(refAttr.value)) {
        const expr = refAttr.value.expression
        if (t.isStringLiteral(expr)) {
          // ref={"myRef"}
          // 将ref收集起来
          this.createStringRef(componentName, id, expr.value)
        
        } else if (t.isArrowFunctionExpression(expr) || t.isMemberExpression(expr)) {
          // ref={this.xxx} / ref={()=> {}}
          const type = DEFAULT_Component_SET.has(componentName) ? 'dom' : 'component'
          // 根据条件收集函数类型的ref
          if (loopCallExpr) {
            this.loopRefs.set(/*...*/)
          } else {
            this.refs.push({/*...*/})
          }
        } else {
          throw codeFrameError(refAttr, 'ref 仅支持传入字符串、匿名箭头函数和 class 中已声明的函数')
        }
      }
      // 删除ref属性
      for (const [index, attr] of attrs.entries()) {
        if (attr === refAttr) {
          attrs.splice(index, 1)
        }
      }
    },
    ClassMethod (path) {
      const node = path.node
      if (t.isIdentifier(node.key)) {
        const name = node.key.name
        self.methods.set(name, path)
        // 处理render函数
        // 处理吧if(xxx) return; 换成 if(xxx) return null;
        if (name === 'render') {
          self.renderMethod = path
          path.traverse({
            ReturnStatement (returnPath) {
              const arg = returnPath.node.argument
              const ifStem = returnPath.findParent(p => p.isIfStatement())
              if (ifStem && ifStem.isIfStatement() && arg === null) {
                const consequent = ifStem.get('consequent')
                if (consequent.isBlockStatement() && consequent.node.body.includes(returnPath.node)) {
                  returnPath.get('argument').replaceWith(t.nullLiteral())
                }
              }
            }
          })
        }
        // 处理constructor函数
        // 收集所有初始化的state
        if (name === 'constructor') {
          path.traverse({
            AssignmentExpression (p) {
              if (
                t.isMemberExpression(p.node.left) &&
                t.isThisExpression(p.node.left.object) &&
                t.isIdentifier(p.node.left.property) &&
                p.node.left.property.name === 'state' &&
                t.isObjectExpression(p.node.right)
              ) {
                const properties = p.node.right.properties
                properties.forEach(p => {
                  if (t.isObjectProperty(p) && t.isIdentifier(p.key)) {
                    self.initState.add(p.key.name)
                  }
                })
              }
            }
          })
        }
      }
    },
    IfStatement (path) {
      // 把if语句中包含jsx语法的复杂判断逻辑用匿名 state 储存
      // if(func()) { return <View> }
      const test = path.get('test') as NodePath<t.Expression>
      const consequent = path.get('consequent')
      if (isContainJSXElement(consequent) && hasComplexExpression(test)) {
        const scope = self.renderMethod && self.renderMethod.scope || path.scope
        generateAnonymousState(scope, test, self.jsxReferencedIdentifiers, true)
      }
    },
    ClassProperty (path) {
      const { key: { name }, value } = path.node
      if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
        self.methods.set(name, path)
      }
      // 收集所有初始化的state
      if (name === 'state' && t.isObjectExpression(value)) {
        value.properties.forEach(p => {
          if (t.isObjectProperty(p)) {
            if (t.isIdentifier(p.key)) {
              self.initState.add(p.key.name)
            }
          }
        })
      }
    },
    JSXExpressionContainer (path) {
      path.traverse({
        MemberExpression (path) {
          // 遍历所有的<JSX attr={any} /> 找到使用的state或者 props 添加到 usedState 中
          const sibling = path.getSibling('property')
          if (
            path.get('object').isThisExpression() &&
            (path.get('property').isIdentifier({ name: 'props' }) || path.get('property').isIdentifier({ name: 'state' })) &&
            sibling.isIdentifier()
          ) {
            const attr = path.findParent(p => p.isJSXAttribute()) as NodePath<t.JSXAttribute>
            const isFunctionProp = attr && typeof attr.node.name.name === 'string' && attr.node.name.name.startsWith('on')
            // 判断是不是方法，默认on开头就认为是
            if (!isFunctionProp) {
              self.usedState.add(sibling.node.name)
            }
          }
        }
      })

      const expression = path.get('expression') as NodePath<t.Expression>
      const scope = self.renderMethod && self.renderMethod.scope || path.scope
      const calleeExpr = expression.get('callee')
      const parentPath = path.parentPath
      // 使用了复杂表达式，并且不是bind函数
      if (
        hasComplexExpression(expression) &&
        !(calleeExpr &&
          calleeExpr.isMemberExpression() &&
          calleeExpr.get('object').isMemberExpression() &&
          calleeExpr.get('property').isIdentifier({ name: 'bind' })) // is not bind
      ) {
          generateAnonymousState(scope, expression, self.jsxReferencedIdentifiers)
      } else {
        // 将所有key={any} 生成匿名变量
        if (parentPath.isJSXAttribute()) {
          if (!(expression.isMemberExpression() || expression.isIdentifier()) && parentPath.node.name.name === 'key') {
              generateAnonymousState(scope, expression, self.jsxReferencedIdentifiers)
          }
        }
      }
      const attr = path.findParent(p => p.isJSXAttribute()) as NodePath<t.JSXAttribute>
      if (!attr) return
      const key = attr.node.name
      const value = attr.node.value
      if (!t.isJSXIdentifier(key)) {
        return
      }
      // 处理所有onXxx的事件属性，生成匿名函数
      if (t.isJSXIdentifier(key) && key.name.startsWith('on') && t.isJSXExpressionContainer(value)) {
          const expr = value.expression
          if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property, { name: 'bind' })) {
              self.buildAnonymousFunc(attr, expr, true)
          } else if (t.isMemberExpression(expr)) {
          self.buildAnonymousFunc(attr, expr as any, false)
        } else {
          throw codeFrameError(path.node, '组件事件传参只能在类作用域下的确切引用(this.handleXX || this.props.handleXX)，或使用 bind。')
        }
      }
      const jsx = path.findParent(p => p.isJSXOpeningElement()) as NodePath<t.JSXOpeningElement>
      // 不在jsx语法中
      if (!jsx) return
      const jsxName = jsx.node.name
      // 不在jsxName不是标识符
      if (!t.isJSXIdentifier(jsxName)) return
      // 是jsx元素
      if (expression.isJSXElement()) return
      // 在收集到的组件中 || 关键字 || 成员表达式 || 文本 || 逻辑表达式 || 条件表达式 || on开头 || 调用表达式
      if (DEFAULT_Component_SET.has(jsxName.name) || expression.isIdentifier() || expression.isMemberExpression() || expression.isLiteral() || expression.isLogicalExpression() || expression.isConditionalExpression() || key.name.startsWith('on') || expression.isCallExpression()) return

      // 上面加了一堆判断，如果都通过了就抽离生成匿名变量，应该是兜底方案
      generateAnonymousState(scope, expression, self.jsxReferencedIdentifiers)
    },
    JSXElement (path) {
      const id = path.node.openingElement.name
      // 收集所有导入并且使用过的自定义组件
      if (
        t.isJSXIdentifier(id) &&
        !DEFAULT_Component_SET.has(id.name) &&
        self.moduleNames.indexOf(id.name) !== -1
      ) {
        const name = id.name
        const binding = self.classPath.scope.getBinding(name)

        if (binding && t.isImportDeclaration(binding.path.parent)) {
          const sourcePath = binding.path.parent.source.value
          // import Custom from './xxx';
          if (binding.path.isImportDefaultSpecifier()) {
            self.customComponents.set(name, {
              sourcePath,
              type: 'default'
            })
          } else {
            // import { Custom } from './xxx';
            self.customComponents.set(name, {
              sourcePath,
              type: 'pattern'
            })
          }
        }
      }
    },
    MemberExpression: (path) => {
      const object = path.get('object')
      const property = path.get('property')
      if (!(object.isThisExpression() && property.isIdentifier({ name: 'props' }))) {
        return
      }
      const parentPath = path.parentPath
      // 处理所有this.props.xxx
      if (parentPath.isMemberExpression()) {
        const siblingProp = parentPath.get('property')
        if (siblingProp.isIdentifier()) {
          const name = siblingProp.node.name
          if (name === 'children') {
            // 将所有的 <View>{this.props.children}</View> -> <slot />;
            // 注意只能是{this.props.children} 
            // 不能是 const { children } = this.props; <View>{children}</View>
            // 不能是 const p = this.props; <View>{p.children}</View>
            parentPath.replaceWith(t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier('slot'), [], true), t.jSXClosingElement(t.jSXIdentifier('slot')), [], true))
          } else if (/^render[A-Z]/.test(name)) {
            // 将所有的 <View>{this.props.renderAbc}</View> -> <slot name="abc" />;
            // 其他限制同上
            const slotName = getSlotName(name)
            parentPath.replaceWith(t.jSXElement(t.jSXOpeningElement(t.jSXIdentifier('slot'), [
              t.jSXAttribute(t.jSXIdentifier('name'), t.stringLiteral(slotName))
            ], true), t.jSXClosingElement(t.jSXIdentifier('slot')), []))

            // 给class上添加静态属性 static multipleSlots = true
            this.setMultipleSlots()
          } else {
            // 收集其他使用到的props名称
            self.componentProperies.add(siblingProp.node.name)
          }
        }
      } else if (parentPath.isVariableDeclarator()) {
        // 处理对this.props的结构语法, 收集所有用到的props
        // const { a, b, c, ...rest } = this.props;
        const siblingId = parentPath.get('id')
        if (siblingId.isObjectPattern()) {
          const properties = siblingId.node.properties
          for (const prop of properties) {
            if (t.isRestProperty(prop)) {
              throw codeFrameError(prop.loc, 'this.props 不支持使用 rest property 语法，请把每一个 prop 都单独列出来')
            } else if (t.isIdentifier(prop.key)) {
              self.componentProperies.add(prop.key.name)
            }
          }
        }
      }
    },

    CallExpression (path) {
      const node = path.node
      const callee = node.callee
      // 处理所有a.b.c(); 形式调用的函数
      /**
      * processThisPropsFnMemberProperties
      *
      * 将this.props.func(a,b,c); -> this.__triggerPropsFn('func', [a,b,c]);
      * 将this.props.obj.func(a,b,c); -> this.__triggerPropsFn('obj.func', [a,b,c]);
      */
      if (t.isMemberExpression(callee) && t.isMemberExpression(callee.object)) {
        const property = callee.property
        if (t.isIdentifier(property)) {
          if (property.name.startsWith('on')) {
            self.componentProperies.add(`__fn_${property.name}`)
            processThisPropsFnMemberProperties(callee, path, node.arguments, false)
          } else if (property.name === 'call' || property.name === 'apply') {
            self.componentProperies.add(`__fn_${property.name}`)
            processThisPropsFnMemberProperties(callee.object, path, node.arguments, true)
          }
        }
      }
    }
  })
}
```

```ts
resetConstructor () {
  const body = this.classPath.node.body.body
  // 如果未定义 constructor 则主动创建一个
  if (!this.methods.has('constructor')) {
    const ctor = buildConstructor()
    body.unshift(ctor)
  }
  if (process.env.NODE_ENV === 'test') {
    return
  }
  for (const method of body) {
    if (t.isClassMethod(method) && method.kind === 'constructor') {
      // 找到 constructor 改成 _constructor
      // 找到 super(xxx) 改成 super._constructor(xxx);
      method.kind = 'method'
      method.key = t.identifier('_constructor')
      if (t.isBlockStatement(method.body)) {
        for (const statement of method.body.body) {
          if (t.isExpressionStatement(statement)) {
            const expr = statement.expression
            if (t.isCallExpression(expr) && (t.isIdentifier(expr.callee, { name: 'super' }) || t.isSuper(expr.callee))) {
              expr.callee = t.memberExpression(t.identifier('super'), t.identifier('_constructor'))
            }
          }
        }
      }
    }
  }
}
```

```ts
findMoreProps () {
  // 这个方法的目的是收集到更多使用的props
  // 因为前面处理了的只有 constructor 和 this.props.xxx const { xxx } = this.props;
  // 
  // 下面遍历所有的带有使用props的声明周期，找到有使用的props属性并收集

  /**
    * 在能生命周期里收集的props如下：
    * shouldComponentUpdate(props) {
    *  console.log(props.arg1);
    *  const { arg2, arg3 } = props;
    *  const p = props;
    *  console.log(p.arg4)
    *  const { arg5 } = p;
    * }
    * shouldComponentUpdate({ arg6, arg7 }) {
    * }
    * 
    * 最终能收集到的 [arg1,arg2,arg3,arg6,arg7];
    * [arg4, arg5] 不能收集到
    */


  // 第一个参数是 props 的生命周期
  const lifeCycles = new Set([
    // 'constructor',
    'componentDidUpdate',
    'shouldComponentUpdate',
    'getDerivedStateFromProps',
    'getSnapshotBeforeUpdate',
    'componentWillReceiveProps',
    'componentWillUpdate'
  ])
  const properties = new Set<string>()
  // 这里的methods是遍历ast的时候收集到的
  this.methods.forEach((method, name) => {
    if (!lifeCycles.has(name)) {
      return
    }
    const node = method.node
    let propsName: null | string = null
    if (t.isClassMethod(node)) {
      propsName = this.handleLifecyclePropParam(node.params[0], properties)
    } else if (t.isArrowFunctionExpression(node.value) || t.isFunctionExpression(node.value)) {
      propsName = this.handleLifecyclePropParam(node.value.params[0], properties)
    }
    if (propsName === null) {
      return
    }
    // 如果找到了propsName说明有类似 shouldComponentUpdate(props) {}
    // 遍历方法ast
    method.traverse({
      MemberExpression (path) {
        if (!path.isReferencedMemberExpression()) {
          return
        }
        // 进行成员表达式遍历 a.b.c 找到所有 propsName.xxx并收集
        const { object, property } = path.node
        if (t.isIdentifier(object, { name: propsName }) && t.isIdentifier(property)) {
          properties.add(property.name)
        }
      },
      VariableDeclarator (path) {
        // 进行变量定义遍历 找到所有 const { name, age } = propsName;
        const { id, init } = path.node
        if (t.isObjectPattern(id) && t.isIdentifier(init, { name: propsName })) {
          for (const prop of id.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              properties.add(prop.key.name)
            }
          }
        }
      }
    })
    properties.forEach((value) => {
      this.componentProperies.add(value)
    })
  })
}
```

```ts
handleRefs () {
  /**
    * this.refs 是在 this.traverse遍历时收集到的，然后将收集到的refs挂到class的属性上
    * 变成这样
    * class Index {
    *   ...,
    *   $$refs = [{
    *    type: "dom",
    *    id: "随机字符串",
    *    refName: "",
    *    fn: this.saveRef
    *   }, {
    *    type: "component",
    *    id: "gMFQv",
    *    refName: "title",
    *    fn: null
    *   }]
    * }
    */
  const objExpr = this.refs.map(ref => {
    return t.objectExpression([
      t.objectProperty(
        t.identifier('type'),
        t.stringLiteral(ref.type)
      ),
      t.objectProperty(
        t.identifier('id'),
        t.stringLiteral(ref.id)
      ),
      t.objectProperty(
        t.identifier('refName'),
        t.stringLiteral(ref.refName || '')
      ),
      t.objectProperty(
        t.identifier('fn'),
        ref.fn ? ref.fn : t.nullLiteral()
      )
    ])
  })

  this.classPath.node.body.body.push(t.classProperty(
    t.identifier('$$refs'),
    t.arrayExpression(objExpr)
  ))
}
```

终于来到了最后一部分，对模板进行生成。这里引入了一个新模块RenderParser

```ts
import { RenderParser } from './render'

parseRender () {
  if (this.renderMethod) {
    this.result.template = this.result.template
      + new RenderParser(
        this.renderMethod,
        this.methods,
        this.initState,
        this.jsxReferencedIdentifiers,
        this.usedState,
        this.loopStateName,
        this.customComponentNames,
        this.customComponentData,
        this.componentProperies,
        this.loopRefs
      ).outputTemplate
  } else {
    throw codeFrameError(this.classPath.node.loc, '没有定义 render 方法')
  }
}
```

老规矩，先看构造函数

```ts
constructor (
  renderPath: NodePath<t.ClassMethod>,
  methods: ClassMethodsMap,
  initState: Set<string>,
  referencedIdentifiers: Set<t.Identifier>,
  usedState: Set<string>,
  loopStateName: Map<NodePath<t.CallExpression>, string>,
  customComponentNames: Set<string>,
  customComponentData: Array<t.ObjectProperty>,
  componentProperies: Set<string>,
  loopRefs: Map<t.JSXElement, LoopRef>
) {
  this.renderPath = renderPath
  this.methods = methods
  this.initState = initState
  this.referencedIdentifiers = referencedIdentifiers
  this.loopStateName = loopStateName
  this.usedState = usedState
  this.customComponentNames = customComponentNames
  this.customComponentData = customComponentData
  this.componentProperies = componentProperies
  this.loopRefs = loopRefs
  const renderBody = renderPath.get('body')
  this.renderScope = renderBody.scope

  const [, error] = renderPath.node.body.body.filter(s => t.isReturnStatement(s))
  if (error) {
    throw codeFrameError(error.loc, 'render 函数顶级作用域暂时只支持一个 return')
  }
  // 上面定义一堆变量

  // 遍历整个render函数进行一些处理
  renderBody.traverse(this.loopComponentVisitor)
  // 遍历整个render函数进行一些处理
  this.handleLoopComponents()
  // 再遍历整个render函数进行一些处理
  renderBody.traverse(this.visitors)
  // 解析ast生成wxml字符串设置到template上
  this.setOutputTemplate()
  // 清除所有jsx语法
  this.removeJSXStatement()
  // 生成$usedState
  this.setUsedState()
  this.setPendingState()
  // 生成$$events
  this.setCustomEvent()
  // 将 render 函数改成 _createData
  this.createData()
  // 生成properties
  this.setProperies()
}
```

从结构上可以看出，重点在 `this.setOutputTemplate()` 之前，之后的几个函数都是在最后阶段为了满足运行时的一些需求给注入一些属性参数

而前三个函数和我们之前所讲的内容基本都在做同样的事，遍历ast、修改ast，因为文章篇幅问题，虽然比较重要但我就不讲了，如果你看懂了前面那这里你直接去看代码吧~比看我讲来会得更快。

有了上面的结果后，我们就能很轻松的处理wxml的生成了

```ts
setOutputTemplate () {
  this.outputTemplate = parseJSXElement(this.finalReturnElement)
}

// 根据配置生成 xml字符串 <div attr1="123" >value</div>
export const createHTMLElement = (options: Options) => {
}

// 将jsx数组转成成wxml字符串
function parseJSXChildren (
  children: (t.JSXElement | t.JSXText | t.JSXExpressionContainer)[]
): string {
  return children
    .filter(child => {
      // 过滤掉所有空字符串节点
      return !(t.isJSXText(child) && child.value.trim() === '')
    })
    .reduce((str, child) => {
      // 如果是字符串，直接拼接
      if (t.isJSXText(child)) {
        return str + child.value.trim()
      }
      // 如果是JSX，通过parseJSXElement转换成字符串
      if (t.isJSXElement(child)) {
        return str + parseJSXElement(child)
      }
      // 如果是JSX表达式容器 {xxx}
      if (t.isJSXExpressionContainer(child)) {
        // 容器的内容是JSX，通过parseJSXElement转换成字符串
        if (t.isJSXElement(child.expression)) {
          return str + parseJSXElement(child.expression)
        }
        // 其他情况转换成源代码拼接上
        return str + `{${
          decodeUnicode(
            generate(child, {
              quotes: 'single',
              jsonCompatibleStrings: true
            })
            .code
          )
          // 去除this. this.state 这些，因为在小程序中wxml中不需要从this开始取值
          .replace(/(this\.props\.)|(this\.state\.)/g, '')
          .replace(/(props\.)|(state\.)/g, '')
          .replace(/this\./g, '')
        }}`
      }
      return str
    }, '')
}

export function parseJSXElement (element: t.JSXElement): string {
  const children = element.children
  const { attributes, name } = element.openingElement
  const TRIGGER_OBSERER = Adapter.type === Adapters.swan ? 'privateTriggerObserer' : '__triggerObserer'
  // <View.A /> 即使 JSX 成员表达式
  if (t.isJSXMemberExpression(name)) {
    throw codeFrameError(name.loc, '暂不支持 JSX 成员表达式')
  }
  const componentName = name.name
  const isDefaultComponent = DEFAULT_Component_SET.has(componentName)
  const componentSpecialProps = SPECIAL_COMPONENT_PROPS.get(componentName)
  let hasElseAttr = false
  attributes.forEach((a, index) => {
    if (a.name.name === Adapter.else && !['block', 'Block'].includes(componentName) && !isDefaultComponent) {
      hasElseAttr = true
      attributes.splice(index, 1)
    }
  })
  if (hasElseAttr) {
    // 如果有 esle 条件且没有用block包裹起来就包上一层<block></block>
    return createHTMLElement({
      name: 'block',
      attributes: {
        [Adapter.else]: true
      },
      value: parseJSXChildren([element])
    })
  }
  let attributesTrans = {}
  if (attributes.length) {
    // 处理JSX的属性
    attributesTrans = attributes.reduce((obj, attr) => {
      if (t.isJSXSpreadAttribute(attr)) {
        throw codeFrameError(attr.loc, 'JSX 参数暂不支持 ...spread 表达式')
      }
      let name = attr.name.name
      if (DEFAULT_Component_SET.has(componentName)) {
        // 将className改成class
        if (name === 'className') {
          name = 'class'
        }
      }
      let value: string | boolean = true
      let attrValue = attr.value
      if (typeof name === 'string') {
        const isAlipayEvent = Adapter.type === Adapters.alipay && /(^on[A-Z_])|(^catch[A-Z_])/.test(name)
        if (t.isStringLiteral(attrValue)) {
          // 如果值是字符串，直接保留
          value = attrValue.value
        } else if (t.isJSXExpressionContainer(attrValue)) {
          // 如果值是jsx表达式容器
          let isBindEvent =
            (name.startsWith('bind') && name !== 'bind') || (name.startsWith('catch') && name !== 'catch')
          // 将表达式转成代码，然后一堆正则处理
          let code = decodeUnicode(generate(attrValue.expression, {
              quotes: 'single',
              concise: true
            }).code)
            .replace(/"/g, "'")
            .replace(/(this\.props\.)|(this\.state\.)/g, '')
            .replace(/this\./g, '')
          if (
            Adapters.swan === Adapter.type &&
            code !== 'true' &&
            code !== 'false' &&
            swanSpecialAttrs[componentName] &&
            swanSpecialAttrs[componentName].includes(name)
          ) {
            value = `{= ${code} =}`
          } else {
            if (Adapter.key === name) {
              const splitCode = code.split('.')
              if (splitCode.length > 1) {
                value = splitCode.slice(1).join('.')
              } else {
                value = code
              }
            } else {
              // 如果是事件就直接用 `code` 否则当字符串处理 `{{code}}`
              value = isBindEvent || isAlipayEvent ? code : `{{${code}}}`
            }
          }
          if (Adapter.type === Adapters.swan && name === Adapter.for) {
            value = code
          }
          if (t.isStringLiteral(attrValue.expression)) {
            // 如果本身就是字符串就直接使用
            value = attrValue.expression.value
          }
        } else if (attrValue === null && name !== Adapter.else) {
          // 处理隐式写法 <View disabled /> => <View disabled="{{true}}">
          value = `{{true}}`
        }
        if (THIRD_PARTY_COMPONENTS.has(componentName) && /^bind/.test(name) && name.includes('-')) {
          name = name.replace(/^bind/, 'bind:')
        }
        if ((componentName === 'Input' || componentName === 'input') && name === 'maxLength') {
          // 单独处理input maxLength
          obj['maxlength'] = value
        } else if (
          componentSpecialProps && componentSpecialProps.has(name) ||
          name.startsWith('__fn_') ||
          isAlipayEvent
        ) {
          obj[name] = value
        } else {
          // 将属性名从驼峰改成`-`
          obj[isDefaultComponent && !name.includes('-') && !name.includes(':') ? kebabCase(name) : name] = value
        }
      }
      if (!isDefaultComponent && !specialComponentName.includes(componentName)) {
        obj[TRIGGER_OBSERER] = '{{ _triggerObserer }}'
      }
      return obj
    }, {})
  } else if (!isDefaultComponent && !specialComponentName.includes(componentName)) {
    attributesTrans[TRIGGER_OBSERER] = '{{ _triggerObserer }}'
  }

  return createHTMLElement({
    // 将驼峰改成 -
    name: kebabCase(componentName),
    attributes: attributesTrans,
    value: parseJSXChildren(children)
  })
}

```

所以其实可以看出来，最终生成wxml没有多么高大上的代码，也是通过递归加字符串拼接将代码一点点拼上，不过之所以最后能这么轻松其实主要是因为在ast语法转换的过程中将太多太多的问题都抹平了，将代码变成了一个比较容易转换的状态。