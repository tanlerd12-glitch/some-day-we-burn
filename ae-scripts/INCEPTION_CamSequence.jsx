/*  =====================================================================
    INCEPTION_CamSequence.jsx  —  After Effects (CC 2020+ / AE 2026)
    ---------------------------------------------------------------------
    สร้างคอมพ์ใหม่ 10 วินาที: กล้องวิ่งตามทาง (ช่วงตรง = โลกจริง)
    แล้วเข้าสู่ "บริเวณที่โค้งงอ" (ในความฝัน) ทางทั้งเส้นพับงอขึ้นฟ้า
    แบบฉากเมืองพับใน Inception ตามสเก็ตช์

    วิธีใช้
      1) เปิดโปรเจกต์ .aep  แล้วเปิดคอมพ์  ฉาก2_blocking  ไว้ (หรือเลือกคอมพ์
         ฉากที่ต้องการใน Project panel — เลือกได้หลายคอมพ์ จะวนใช้เป็นเฟรมต่อ ๆ กัน)
      2) File > Scripts > Run Script File...  > เลือกไฟล์นี้
      3) ได้คอมพ์  ฉาก2_INCEPTION_CAM  (10 วิ) + เพิ่มเข้า Render Queue ให้แล้ว

    โครงสร้างที่สร้าง
      CAM_RIG (null 3D)  = ตำแหน่ง + การเงยขึ้นตามความโค้งของทาง (คีย์ทุกเฟรม)
        └ CAM_INCEPTION   = กล้อง (one-node) + การ roll ช่วงโค้งงอ
      PANEL_xx            = พรีคอมพ์ฉาก วางเป็น "ประตู" เรียงตามทาง กล้องวิ่งทะลุ
      RUNG_xx / RAIL_xx   = ขั้นบันได/ราวทางแบบในสเก็ตช์
      Marker บนคอมพ์      = จุดเริ่ม "ในความฝัน" (เริ่มโค้งงอ)

    ปรับค่าได้ที่ CFG ด้านล่าง
    ===================================================================== */
(function inceptionCamSequence() {

    // ---------------------------------------------------------------- CONFIG
    var CFG = {
        compName:     "ฉาก2_INCEPTION_CAM",   // ฉาก2_INCEPTION_CAM
        sourceName:   "ฉาก2_blocking",        // ฉาก2_blocking (ใช้ถ้าไม่ได้เลือกคอมพ์)
        duration:     10,       // วินาที
        straightLen:  3800,     // ความยาวช่วงทางตรง (px)
        bendLen:      6500,     // ความยาวช่วงโค้งงอ (px)
        foldDeg:      105,      // ทางพับขึ้นสูงสุดกี่องศา (90 = ตั้งฉาก, >90 = พับข้ามหัว)
        camTravel:    11500,    // ระยะที่กล้องวิ่งทั้งหมดใน 10 วิ
        anticipate:   350,      // กล้องเงยล่วงหน้าก่อนถึงโค้ง (px)
        rollMax:      14,       // กล้องเอียง (roll) สูงสุดช่วงในความฝัน (องศา)
        camZoom:      1500,     // zoom ของกล้อง (px)
        firstPanel:   1700,     // ระยะเฟรมฉากแรกจากกล้อง
        panelSpacing: 1100,     // ระยะห่างระหว่างเฟรมฉาก
        panelScale:   62,       // สเกลเฟรมฉาก (%)
        fadeNear:     220,      // เฟรมจางหายเมื่อกล้องใกล้กว่านี้
        fadeFar:      900,      // ...และชัด 100% เมื่อไกลกว่านี้
        roadWidthMul: 1.55,     // ความกว้างทาง = ความกว้างเฟรม x ค่านี้
        rungEvery:    260,      // ระยะห่างขั้นบันได
        rungThick:    10,
        railWidth:    14,
        lineColor:    [0.36, 0.86, 1.0],   // สีเส้นทาง (ฟ้า neon ให้เข้ากับฉาก)
        bgColor:      [0.035, 0.05, 0.11],
        motionBlur:   true,
        addToRenderQueue: true
    };

    // ---------------------------------------------------------------- HELPERS
    function findCompByName(name) {
        for (var i = 1; i <= app.project.numItems; i++) {
            var it = app.project.item(i);
            if (it instanceof CompItem && it.name === name) return it;
        }
        return null;
    }
    function uniqueCompName(base) {
        var n = base, k = 2;
        while (findCompByName(n)) { n = base + "_v" + k; k++; }
        return n;
    }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
    function smoother(u) { u = Math.max(0, Math.min(1, u)); return u * u * u * (u * (u * 6 - 15) + 10); }
    var D2R = Math.PI / 180;

    // ทิศทางการหมุนแกน X ของ AE วัดจริงด้วย expression (กันพลาดเรื่องเครื่องหมาย)
    function measureXRotSign(comp) {
        var sgn = 1;
        try {
            var n = comp.layers.addNull();
            n.threeDLayer = true;
            n.transform.xRotation.setValue(90);
            var fx = n.property("ADBE Effect Parade").addProperty("ADBE Point3D Control");
            fx.property(1).expression =
                "var a = thisLayer.toWorld([0,0,0]); var b = thisLayer.toWorld([0,0,100]); b - a;";
            var v = fx.property(1).valueAtTime(0, false);
            if (v[1] < -50) sgn = -1; else if (v[1] > 50) sgn = 1;
            var src = n.source;
            n.remove();
            try { if (src && src.usedIn.length === 0) src.remove(); } catch (e1) {}
        } catch (e) {}
        return sgn;
    }

    // ---------------------------------------------------------------- SOURCES
    var sources = [];
    var sel = app.project.selection;
    for (var si = 0; si < sel.length; si++) {
        if (sel[si] instanceof CompItem && sel[si].name.indexOf("INCEPTION_CAM") < 0) sources.push(sel[si]);
    }
    if (!sources.length) {
        var ai = app.project.activeItem;
        if (ai instanceof CompItem && ai.name.indexOf("INCEPTION_CAM") < 0) sources.push(ai);
    }
    if (!sources.length) {
        var byName = findCompByName(CFG.sourceName);
        if (byName) sources.push(byName);
    }
    if (!sources.length) {
        alert("INCEPTION CAM:\nOpen the scene comp (e.g. ฉาก2_blocking) or select scene comps in the Project panel, then run again.");
        return;
    }
    var ref = sources[0];

    app.beginUndoGroup("Inception Camera Sequence");
    try {
        // ------------------------------------------------------------ COMP
        var W = ref.width, H = ref.height, FPS = ref.frameRate;
        var comp = app.project.items.addComp(uniqueCompName(CFG.compName), W, H,
                                             ref.pixelAspect, CFG.duration, FPS);
        comp.bgColor = CFG.bgColor;
        comp.motionBlur = CFG.motionBlur;
        if (ref.parentFolder) comp.parentFolder = ref.parentFolder;

        var SGN = measureXRotSign(comp);

        // ------------------------------------------------------------ PATH
        // φ(s): 0 ในช่วงตรง → foldDeg ในช่วงโค้ง (ease นุ่ม ๆ)
        function phiAt(s) {
            if (s <= CFG.straightLen) return 0;
            return CFG.foldDeg * smoother((s - CFG.straightLen) / CFG.bendLen);
        }
        // forward = (0, -sinφ, cosφ)  (ขึ้นฟ้า), down = (0, cosφ, sinφ)
        function fwd(phi) { return [0, -Math.sin(phi * D2R), Math.cos(phi * D2R)]; }
        function down(phi) { return [0, Math.cos(phi * D2R), Math.sin(phi * D2R)]; }
        function aeRotX(phi) { return -SGN * phi; }

        var DS = 5;
        var LMAX = CFG.camTravel + CFG.firstPanel + CFG.panelSpacing * 3 + 2000;
        var table = [[0, 0, 0]];
        for (var k = 1; k * DS <= LMAX + DS; k++) {
            var ph = phiAt((k - 0.5) * DS);
            table.push(add(table[k - 1], mul(fwd(ph), DS)));
        }
        var ORIGIN = [W / 2, H / 2, 0];
        function posAt(s) {
            var f = s / DS, i = Math.floor(f), t = f - i;
            if (i >= table.length - 1) { i = table.length - 2; t = 1; }
            var a = table[i], b = table[i + 1];
            return add(ORIGIN, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
        }

        // ------------------------------------------------------------ PANELS (ฉาก)
        var panelH = H * CFG.panelScale / 100;
        var panelW = W * CFG.panelScale / 100;
        var roadDrop = panelH / 2;
        var nPanels = Math.ceil((CFG.camTravel + CFG.panelSpacing * 2 - CFG.firstPanel) / CFG.panelSpacing) + 1;
        var fadeExpr =
            "var c = thisComp.layer(\"CAM_INCEPTION\");\n" +
            "var d = length(toWorld(anchorPoint), c.toWorld([0,0,0]));\n" +
            "linear(d, " + CFG.fadeNear + ", " + CFG.fadeFar + ", 0, 100);";

        for (var p = 0; p < nPanels; p++) {
            var src = sources[p % sources.length];
            var s = CFG.firstPanel + p * CFG.panelSpacing;
            var L = comp.layers.add(src);
            L.name = "PANEL_" + (p < 9 ? "0" : "") + (p + 1) + " · " + src.name;
            L.threeDLayer = true;
            L.transform.scale.setValue([CFG.panelScale, CFG.panelScale, CFG.panelScale]);
            L.transform.position.setValue(posAt(s));
            L.transform.xRotation.setValue(aeRotX(phiAt(s)));
            L.transform.opacity.expression = fadeExpr;
            if (CFG.motionBlur) L.motionBlur = true;
            if (src.duration < CFG.duration) {         // ฉากสั้นกว่า 10 วิ → วนซ้ำ
                try {
                    L.timeRemapEnabled = true;
                    L.property("ADBE Time Remapping").expression = "loopOut(\"cycle\")";
                    L.outPoint = CFG.duration;
                } catch (eTR) {}
            }
        }

        // ------------------------------------------------------------ ROAD (ขั้นบันได + ราว)
        var roadW = panelW * CFG.roadWidthMul;
        var rungBase = comp.layers.addSolid(CFG.lineColor, "RUNG", Math.round(roadW), CFG.rungThick, 1, CFG.duration);
        var railBase = comp.layers.addSolid(CFG.lineColor, "RAIL", CFG.railWidth, CFG.rungEvery, 1, CFG.duration);
        rungBase.threeDLayer = true; railBase.threeDLayer = true;

        function placeFlat(layer, s, xOff) {
            var phi = phiAt(s);
            layer.transform.position.setValue(add(add(posAt(s), mul(down(phi), roadDrop)), [xOff, 0, 0]));
            layer.transform.xRotation.setValue(aeRotX(phi) + 90);   // นอนราบกับพื้นทาง
        }
        var nR = Math.floor(LMAX / CFG.rungEvery), r, dup;
        for (r = 0; r <= nR; r++) {
            dup = (r === 0) ? rungBase : rungBase.duplicate();
            dup.name = "RUNG_" + r;
            placeFlat(dup, r * CFG.rungEvery, 0);
            if (r < nR) {
                for (var side = -1; side <= 1; side += 2) {
                    var rl = (r === 0 && side === -1) ? railBase : railBase.duplicate();
                    rl.name = "RAIL_" + (side < 0 ? "L_" : "R_") + r;
                    placeFlat(rl, (r + 0.5) * CFG.rungEvery, side * roadW / 2);
                }
            }
        }

        // ------------------------------------------------------------ CAMERA RIG
        var rig = comp.layers.addNull(CFG.duration);
        rig.name = "CAM_RIG";
        rig.threeDLayer = true;
        rig.transform.anchorPoint.setValue([0, 0, 0]);

        var cam = comp.layers.addCamera("CAM_INCEPTION", [W / 2, H / 2]);
        cam.autoOrient = AutoOrientType.NO_AUTO_ORIENT;
        cam.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(CFG.camZoom);
        cam.parent = rig;
        cam.transform.position.setValue([0, 0, 0]);
        cam.transform.orientation.setValue([0, 0, 0]);

        // s(t): ออกตัวช้า → พุ่งในช่วงโค้ง → ผ่อนตอนจบ
        function sAt(t) {
            var u = t / CFG.duration;
            return CFG.camTravel * (0.35 * u + 0.65 * (0.5 - 0.5 * Math.cos(Math.PI * u)));
        }
        var nF = Math.round(CFG.duration * FPS);
        var times = [], posV = [], rotV = [], rollV = [], dreamT = -1;
        for (var f = 0; f <= nF; f++) {
            var t = f / FPS, sc = sAt(t);
            times.push(t);
            posV.push(posAt(sc));
            rotV.push(aeRotX(phiAt(sc + CFG.anticipate)));
            var ub = (sc - CFG.straightLen) / CFG.bendLen;
            rollV.push(ub > 0 ? CFG.rollMax * Math.sin(Math.PI * Math.min(1.25, ub) / 1.25) : 0);
            if (dreamT < 0 && sc >= CFG.straightLen) dreamT = t;
        }
        rig.transform.position.setValuesAtTimes(times, posV);
        rig.transform.xRotation.setValuesAtTimes(times, rotV);
        cam.transform.zRotation.setValuesAtTimes(times, rollV);

        // ------------------------------------------------------------ MARKERS
        try {
            comp.markerProperty.setValueAtTime(0, new MarkerValue("REAL · กล้องวิ่งตาม"));
            if (dreamT >= 0)
                comp.markerProperty.setValueAtTime(dreamT, new MarkerValue("INCEPTION · ในความฝัน"));
        } catch (eM) {}

        // ------------------------------------------------------------ RENDER QUEUE
        if (CFG.addToRenderQueue) {
            var rq = app.project.renderQueue.items.add(comp);
            try {
                if (app.project.file) {
                    var om = rq.outputModule(1);
                    om.file = new File(app.project.file.parent.fsName + "/" + comp.name + ".mov");
                }
            } catch (eRQ) {}
        }

        comp.openInViewer();
        comp.time = 0;
    } catch (err) {
        alert("INCEPTION CAM error (line " + err.line + "):\n" + err.toString());
    } finally {
        app.endUndoGroup();
    }
})();
