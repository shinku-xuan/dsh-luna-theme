# 第三方素材声明 / Third-Party Notices

本文件说明本项目（dsh-luna-theme）随附的**非代码素材**与**第三方代码**的来源与权利归属。
**仓库根目录的 `LICENSE`（MIT）只覆盖本项目自己的代码，不覆盖下列素材。**
余额挂件的代码另按第 3 节声明。

---

## 1. 《近月少女的礼仪》游戏素材

本插件随附下列图像素材，均取自 / 派生自游戏
**《近月少女的礼仪》（月に寄りそう乙女の作法）** 的视觉素材：

| 文件 | 用途 | 处理 |
|---|---|---|
| `assets/wallpaper.webp` | 界面壁纸 | 经模糊与重新编码 |
| `assets/luna-settings.webp` | 设置面板背景 | 中心方裁切后经模糊与重新编码 |
| `assets/luna-noon.webp` | 余额挂件底图 | 原样，复制自 Luna-Chat 前端随附的 `api_balance_noon.webp` |
| `assets/asahi.webp` | 桌宠的单图立绘（无姿态图时的回退） | 原样，Q 版立绘 |
| `assets/pet-art/*.webp`（11 张） | 桌宠的各姿态立绘 | 按 alpha 包围盒统一角色高、水平居中、脚底对齐后重新编码 |

- **该游戏素材的全部权利（包括著作权及相关权利）归 Navel 所有。**
- 本项目**不主张**对上述素材的任何权利，也**与 Navel 无任何隶属、合作或背书关系**。
- 素材在此仅作为**个人、非商业**用途的界面装饰使用（桌宠/换肤背景）。
- 本项目**不销售**、不授权、不再分发该素材本身；使用者不应将其用于商业用途，
  也不应据其主张任何权利。
- 若权利人 Navel 认为本使用方式不妥，**请提出，本项目会立即移除相关素材**
  （删除对应文件即可，不影响插件其余功能：删 `assets/wallpaper.webp` 回退为无壁纸，
  删 `assets/luna-settings.webp` 后设置面板回退为原主题底色，
  删 `assets/luna-noon.webp` 后挂件回退为鲸鱼底图或显示占位，
  删 `assets/asahi.webp` 与 `assets/pet-art/` 后桌宠不显示 —— 它不会在界面上留破图）。

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

本项目对 `widget.js` 的改动：底图改为 `assets/luna-noon.webp`、图片按扩展名给出 MIME、
绘图尺寸持久化的路径改为跟随包目录、样式表加 `data-plugin` 归属标记、
插件名改为 `luna-balance-widget` 以便单独开关。

> 上游仓库的 `assets/`（鲸鱼图、动图、音效）**不在 MIT 覆盖范围内**，也未随本项目分发；
> `DSniang02.png` 只作为本机已存在文件的回退路径被引用，不随包提供。

## 4. 本项目代码

除上述素材与第 3 节声明的派生代码外的全部文件（`client.js`、`index.js` 等）
均以 **MIT License** 授权，详见仓库根目录的 `LICENSE`。
