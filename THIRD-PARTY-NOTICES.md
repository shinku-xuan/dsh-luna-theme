# 第三方素材声明 / Third-Party Notices

本文件说明本项目（dsh-luna-theme）随附的**非代码素材**与**第三方代码**的来源与权利归属。
**仓库根目录的 `LICENSE`（MIT）只覆盖本项目自己的代码，不覆盖下列素材。**
余额挂件的代码另按第 3 节声明。

---

## 1. 《近月少女的礼仪》游戏素材

本插件随附下列图像与音频素材，均取自 / 派生自游戏
**《近月少女的礼仪》（月に寄りそう乙女の作法）** 的视觉素材：

| 文件 | 用途 | 处理 |
|---|---|---|
| `assets/wallpaper.webp` | 界面壁纸 | 经模糊与重新编码 |
| `assets/luna-settings.webp` | 设置面板背景 | 中心方裁切后经模糊与重新编码 |
| `assets/luna-noon.webp` | 余额挂件底图 | 原样，复制自 Luna-Chat 前端随附的 `api_balance_noon.webp` |
| `assets/luna-bot.png` | 余额挂件的透明底极简机器人头像 | 以用户提供的露娜冬季校服图为角色参考，通过内置 imagegen 生成并去除背景；镜像显示与白色余额框由界面绘制 |
| `assets/opening/*.png`、`*.webp` | 双主题开屏背景、角色、花瓣、Logo 与启动页皮肤 | 用户提供的游戏素材原样复制，通过 CSS 组合与裁切 |
| `assets/opening/lun_sp06.wav` | 全黑阶段的开场语音 | 用户提供的游戏音频原样复制 |
| `assets/asahi.webp` | 桌宠的单图立绘（无姿态图时的回退） | 原样，Q 版立绘 |
| `assets/pet-art/*.webp`（12 张静态姿态 + 12 张动作图集） | 桌宠的姿态立绘与连续动作 | 原有姿态按 alpha 包围盒统一角色高、水平居中、脚底对齐；动作图集与坠落姿态以现有角色图为参考由 AI 生成，裁切对齐后重新编码 |

- **该游戏素材的全部权利（包括著作权及相关权利）归 Navel 所有。**
- 本项目**不主张**对上述素材的任何权利，也**与 Navel 无任何隶属、合作或背书关系**。
- 素材在此仅作为**个人、非商业**用途的界面装饰使用（桌宠/换肤背景）。
- 本项目**不销售**或单独授权上述素材；使用者不应将其用于商业用途，
  也不应据其主张任何权利。
- 若权利人 Navel 认为本使用方式不妥，**请提出，本项目会立即移除相关素材**
  （删除对应文件即可，不影响插件其余功能：删 `assets/wallpaper.webp` 回退为无壁纸，
  删 `assets/luna-settings.webp` 后设置面板回退为原主题底色，
  删 `assets/luna-bot.png` 后头像路由返回 404，白色余额框继续显示，
  删 `assets/asahi.webp` 与 `assets/pet-art/` 后桌宠不显示；
  开屏素材缺失时显示重试，可点击画面跳过，或停用 `luna-opening` 组件）。

## 2. 视觉语言参考

插件的配色与材质语言参考了 [Luna-Chat](https://gitee.com/ciallo0d00/luna-chat) 前端的视觉设计
（深靛蓝底、半透明紫玻璃面板、樱花粉第二强调色）。该参考仅涉及**设计语言**，
不包含对方代码或素材的复制（第 1 节那张底图除外，其权利归属见上）。

## 3. 余额挂件代码

`widget.js` 的宿主半边与其中的页面脚本，派生自
[DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)
（作者 MeteorNOX）的发布包，该项目的**代码**以 MIT License 授权：

```
MIT License

Copyright (c) 2026 MeteorNOX
```

本项目对 `widget.js` 的改动：使用独立机器人头像与白色余额框，新增收起与展开、余额与本日账单切换、计费时段提示、双语文案和主题次档按钮，图片按扩展名给出 MIME，绘图尺寸持久化的路径跟随包目录，样式表带 `data-plugin` 归属标记，插件名为 `luna-balance-widget` 以便单独开关，页面脚本提供停用清理。

> 上游仓库的 `assets/`（鲸鱼图、动图、音效）**不在 MIT 覆盖范围内**，也未随本项目分发；
> `DSniang02.png` 只作为本机已存在文件的回退路径被引用，不随包提供。

## 4. 本项目代码

除上述素材与第 3 节声明的派生代码外的全部文件（`client.js`、`index.js` 等）
均以 **MIT License** 授权，详见仓库根目录的 `LICENSE`。
