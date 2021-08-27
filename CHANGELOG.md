### v2.0.4
* Add a feature to parse bidirectional binding `{==}` to a directive key with some tokens.
* Add a feature to parse `slot scope` i.e. `var-*` without tokens only to relate to variables.

### v2.0.3
* Fix a bug when template is not Literal or TemplateLiteral in .ts/.js file.

### v2.0.2
* Add a feature to parse `s-for` consistent with san.
* Add template infomation in the source file.
* Fix parser services api `defineTemplateBodyVisitor` to handle `templateBody` array.

### V2.0.1

* Add a feature to parse interpolation in `s-bind` directive.
* Add a feature to parse interpolation in common attribute to link variables in template.

### V2.0.0

* Add a feature to [parse templates](https://github.com/searchfe/san-eslint-parser/pull/5) in `ts/js` file.
