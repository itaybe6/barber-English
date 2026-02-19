/**
 * Expo/Metro on web loads the bundle as a classic script (not an ES module),
 * so `import.meta` will crash at runtime with:
 *   "Cannot use 'import.meta' outside a module"
 *
 * Some dependencies (and some bundler tooling) still emit `import.meta.*`
 * for ESM-centric environments (e.g. Vite: `import.meta.env`, `import.meta.hot`).
 *
 * This plugin rewrites common `import.meta` access patterns into safe runtime
 * expressions for the Expo web environment.
 */
module.exports = function transformImportMetaExpoWeb({ types: t }) {
  const isImportMeta = (node) =>
    node &&
    node.type === 'MetaProperty' &&
    node.meta?.type === 'Identifier' &&
    node.meta.name === 'import' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'meta';

  const processEnvExpr = () =>
    t.conditionalExpression(
      t.binaryExpression('!==', t.unaryExpression('typeof', t.identifier('process')), t.stringLiteral('undefined')),
      t.memberExpression(t.identifier('process'), t.identifier('env')),
      t.objectExpression([])
    );

  const locationHrefExpr = () =>
    t.conditionalExpression(
      t.logicalExpression(
        '&&',
        t.binaryExpression('!==', t.unaryExpression('typeof', t.identifier('globalThis')), t.stringLiteral('undefined')),
        t.logicalExpression(
          '&&',
          t.memberExpression(t.identifier('globalThis'), t.identifier('location'), false, true),
          t.memberExpression(
            t.memberExpression(t.identifier('globalThis'), t.identifier('location'), false, true),
            t.identifier('href'),
            false,
            true
          )
        )
      ),
      t.memberExpression(
        t.memberExpression(t.identifier('globalThis'), t.identifier('location'), false, true),
        t.identifier('href'),
        false,
        true
      ),
      t.stringLiteral('')
    );

  const importMetaObjectExpr = () =>
    t.objectExpression([
      t.objectProperty(t.identifier('env'), processEnvExpr()),
      t.objectProperty(t.identifier('url'), locationHrefExpr()),
      t.objectProperty(t.identifier('hot'), t.identifier('undefined')),
    ]);

  const getMemberName = (memberExprNode) => {
    if (!memberExprNode) return null;
    if (!memberExprNode.computed && memberExprNode.property?.type === 'Identifier') {
      return memberExprNode.property.name;
    }
    if (memberExprNode.computed && memberExprNode.property?.type === 'StringLiteral') {
      return memberExprNode.property.value;
    }
    return null;
  };

  return {
    name: 'transform-import-meta-expo-web',
    visitor: {
      MemberExpression(path) {
        const { node } = path;
        if (!isImportMeta(node.object)) return;

        const name = getMemberName(node);
        if (name === 'env') {
          path.replaceWith(processEnvExpr());
          return;
        }
        if (name === 'hot') {
          path.replaceWith(t.identifier('undefined'));
          return;
        }
        if (name === 'url') {
          path.replaceWith(locationHrefExpr());
          return;
        }

        // Unknown property: replace `import.meta.<x>` with a safe object access.
        // This keeps code shape but avoids the syntax error.
        path.replaceWith(t.memberExpression(importMetaObjectExpr(), node.property, node.computed));
      },

      MetaProperty(path) {
        if (!isImportMeta(path.node)) return;
        // Bare `import.meta` usage.
        path.replaceWith(importMetaObjectExpr());
      },
    },
  };
};

