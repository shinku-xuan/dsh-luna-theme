# dsh-luna-theme

> 借鉴 [Luna-Chat](https://gitee.com/ciallo0d00/luna-chat) 视觉语言的 **DeepSeek Harness（DSH）换肤插件**，桌面端与 Web 端通用。
>
> A Luna-Chat inspired theme plugin for the DeepSeek Harness desktop and web shells.

**换肤部分只改样式，不改功能。** 插件不注册工具、不读写会话、不改用户设置；停用后界面完全恢复原样。

0.3.0 起包内附一个**可选**的余额挂件（右下角露娜立绘，气泡里是 DeepSeek 账户余额）。
它会读取你的 `DEEPSEEK_API_KEY` 并向 `api.deepseek.com` 查询余额 —— 不想要就按
[关闭余额挂件](#关闭余额挂件) 关掉，插件即回到纯换肤。

---

## 效果

深靛蓝底 + 半透明紫玻璃面板 + 樱花粉第二强调色 + 金色 CTA，外加一张铺满全屏的壁纸。

| 角色 | 暗色 | 亮色 |
|---|---|---|
| 应用底 / 对话区 | `rgba(26,26,46,.23)` | `rgba(247,245,252,.16)` |
| 侧栏 | `rgba(15,15,35,.25)` | `rgba(242,190,210,.18)` 淡樱花粉 |
| 抬升面（卡片 / 弹窗） | `#16213e` / `#1e1e3a` / `#262648` | `#ffffff` / `#f6f3fd` / `#efeaf9` |
| 菜单玻璃 | `rgba(41,32,78,.78)` + `blur(14px)` | `rgba(255,255,255,.80)` + `blur(14px)` |
| 正文 / 次级 / 三级 | `#e8e8ed` / `#dbdbe9` / `#cfcfdd` | `#221c36` / `#332d47` / `#544c6e` |
| 链接 | 樱花 `#ffced8` | 深酒红 `#7d0a36` |
| 主按钮 | 金底 `#c8a96a` + 深紫字 | 紫底 `#4a3a7a` + 金字 |
| 圆角 | `round`（正圆弧，非 DSH 默认的超椭圆） | 同左 |

除配色外还调整了：壁纸层与遮罩、选区颜色、Markdown 标题的樱花竖线、分隔线渐变、引用块、
列表符号，以及对话区右缘**轮次导航**（快速跳转刻度）的樱花配色。

> 轮次导航只有会话达到 2 轮以上时才出现，这是 DSH 组件自身的行为。

## 安装

需要 DSH CLI。把插件作为 bundle 装进目标 profile：

```sh
# 从 GitHub 仓库直接装
dsh plugin --profile desktop add github:shinku-xuan/dsh-luna-theme

# 或从本地目录 / 打包产物
dsh plugin --profile desktop add ./dsh-luna-theme
dsh plugin --profile desktop add ./dsh-luna-theme-0.3.0.tgz
```

装完**重启桌面端**（或 DSH Web 进程）生效。

> 换肤部分改完不用重启就能看到（客户端 bundle 是热重载的），但**余额挂件那部分要重启才生效**。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-luna-theme
```

移除后 token 层与样式表都会自动撤回，界面回到 DSH 原样。

## 余额挂件

右下角一张露娜立绘，气泡里是 DeepSeek 账户余额：

- **余额**取自 `https://api.deepseek.com/user/balance`，密钥是 profile 里配置的 `DEEPSEEK_API_KEY`
  （未配置时气泡显示提示）；宿主侧有 25 秒缓存与请求去重，60 秒自动刷新，**点击立刻刷新**。
- **拖拽**：拖到左右各四分之一区域自动吸附该边，吸附在左侧时整只（含文字）水平翻转。
- **大小**：悬停后右上角出现 `-` / `+`，缩放会记到插件目录里。
- 瞬时网络失败时继续显示上一次的余额，不会闪错误。

### 关闭余额挂件

在 profile 的 `cordis.patch.yml` 里加一条，然后重启 DSH：

```yaml
- id: luna-balance-widget
  disabled: true
```

删掉这条即恢复。挂件与换肤是**两条独立的行**：关掉挂件不影响换肤；但反过来关掉整个插件
（即换肤那一行）会连挂件一起关掉 —— 页面脚本是由换肤的客户端 bundle 加载的。

> 挂件大小记在插件自己的目录里，**重装插件会重置为默认大小**。

## 兼容性

- 面向 DSH 桌面端 / Web 端（`dsh.client.platform: web`）。
- 依赖 DSH 的 `--dsw-*` 别名 token（当前覆盖 87 个）。**DSH 大版本升级后 token 名可能变化**，
  若发现某些界面不再跟随主题，通常就是这个原因。
- 不修改任何布局：内外边距、控件尺寸、字号一律不动。唯一例外是 Markdown 分隔线由 `0.5px`
  改为 `1px`，因为发丝线承载不了樱花渐变。

## 替换壁纸

壁纸 `assets/wallpaper.webp` 是**内联在 `client.js` 里的 data URI**（不写成外链，是为了让加载链路
上任何一环都不能静默失败）。要换成自己的图，需要：

1. 准备一张图片（建议 1920×1080），转成 WebP 并压到 ~40 KB 量级；
2. base64 编码后替换 `client.js` 里 `WALLPAPER_DATA_URI` 的值；
3. 重启 DSH。

想去掉壁纸只保留配色，把 `--luna-scrim` 的 alpha 调到 `1` 即可得到纯色底。

## 许可

- **本项目的代码**：MIT，见 [`LICENSE`](LICENSE)。
- **余额挂件的代码**（`widget.js`）派生自 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
  （MIT，© 2026 MeteorNOX），随包保留原作者版权声明，本项目对其的改动清单见
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) 第 3 节。
- **随附的图像素材**：**不适用 MIT**，权利归原权利人所有 —— 见下方声明与
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

## 第三方素材与免责声明

本插件随附的两张图像素材 —— 壁纸 `assets/wallpaper.webp` 与余额挂件底图 `assets/luna-noon.webp`
—— 均取自 / 派生自游戏 **《近月少女的礼仪》（月に寄りそう乙女の作法）** 的视觉素材。

- **该素材的全部权利归 Navel 所有。**
- 本项目**不主张**对上述素材的任何权利，与 Navel **无任何隶属、合作或背书关系**。
- 素材仅作为**个人、非商业**用途的界面装饰使用；请勿用于商业用途，也请勿据其主张任何权利。
- 若权利人认为使用不妥，**提出后会立即移除**（删除对应文件并调整引用，不影响插件其余功能：
  删 `assets/wallpaper.webp` 回退为无壁纸，删 `assets/luna-noon.webp` 后挂件底图回退或显示占位）。

完整说明见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。
