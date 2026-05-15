# bumpkg

`bumpkg` 是一个用来检查并批量升级项目依赖的 CLI 工具。默认只处理 `minor` 和 `patch` 更新，只有显式传入 `--major` 时才会把 `major` 升级纳入展示和回写流程。

## Usage

```bash
bumpkg
bumpkg --cwd ./packages/app
bumpkg --major
```

执行流程：

1. 解析当前项目或 monorepo 配置
2. 检测可升级依赖
3. 输出依赖升级表格
4. 用户确认后回写依赖版本
5. 删除支持的 lock 文件

## Flags

- `--cwd`: 指定扫描目录
- `--major`: 将 `major` 升级纳入检测、展示和替换

## Development

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## License

[MIT](./LICENSE) License © [lonewolfyx](https://github.com/lonewolfyx)
