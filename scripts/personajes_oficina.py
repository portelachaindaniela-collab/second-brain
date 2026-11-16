import os
O = "#2b2b2b"
SW = 1.6
OUT = "/home/claude/canvas/project"

STATE = {"work": "#3fae6e", "problem": "#e05252", "break": "#e8973a", "sleep": "#8a84a8"}

CAST = [
    dict(id="c1", hair="curls", hc="#2a1d17", skin="#8d5a3b", top="blouse", tc="#c9775a", bottom="skirt", bc="#2f3e56", shoe="#2b2b2b", earrings=True,
         l1="Rulos y aros", l2="Blusa y pollera"),
    dict(id="c2", hair="short", hc="#6b4a2e", skin="#f3d2b8", top="shirt_tie", tc="#fafafa", tie="#2f3e56", bottom="pants", bc="#3a3a3a", shoe="#2b2b2b", glasses=True,
         l1="Lentes", l2="Camisa, corbata y pantalón"),
    dict(id="c3", hair="short", hc="#262626", skin="#c68b59", top="blazer", tc="#fafafa", jc="#2f3e56", inner="tee", bottom="pants", bc="#d8cbb5", shoe="#5a4636", beard=True,
         l1="Barba", l2="Saco sobre remera"),
    dict(id="c4", hair="buzz", hc="#4a3426", skin="#e0b48e", top="polo", tc="#9bb0a0", bottom="pants", bc="#2f3e56", shoe="#2b2b2b", mustache=True,
         l1="Bigote", l2="Chomba y pantalón"),
    dict(id="c5", hair="long", hc="#1f1f1f", skin="#f3d2b8", top="tee", tc="#3a3a3a", bottom="pants", bc="#5d7590", shoe="#fafafa", tattoo=True, ear_piercing=True,
         l1="Pelo largo, tatuajes", l2="Remera y jean"),
    dict(id="c6", hair="bun", hc="#3b2416", skin="#5e3b28", top="blouse", tc="#fafafa", bottom="pants", bc="#3a3a3a", shoe="#2b2b2b", nose_piercing=True,
         l1="Rodete, piercing", l2="Blusa y pantalón"),
    dict(id="c7", hair="bald", hc="#3a2a20", skin="#c68b59", top="shirt", tc="#bcd0e3", bottom="pants", bc="#3a3a3a", shoe="#2b2b2b", glasses=True, beard=True,
         l1="Pelado, lentes, barba", l2="Camisa y pantalón"),
    dict(id="c8", hair="pony", hc="#8a5a3a", skin="#e0b48e", top="blazer", tc="#fafafa", jc="#d8cbb5", inner="blouse", bottom="skirt", bc="#3a3a3a", shoe="#2b2b2b",
         l1="Colita", l2="Saco, blusa y pollera"),
]
DANI = dict(id="dani", hair="long_up", hc="#2a1c16", skin="#f1d0b8", top="blazer", tc="#fafafa", jc="#1f2a3d", inner="vblouse", bottom="pants", bc="#2b2b2b", shoe="#2b2b2b",
            glasses="square", studs=True, necklace=True, face="oval", slim=True, l1="Daniela", l2="Saco azul, blusa blanca, lentes cuadrados y cadenita")
BY = {c["id"]: c for c in CAST}
BY["dani"] = DANI


def head(c, expr):
    H, K, st = c["hc"], c["skin"], c["hair"]
    s = []
    if st == "long":
        s.append(f'<rect x="-19" y="-190" width="38" height="50" rx="15" fill="{H}"/>')
    if st == "curls":
        for x, y, r in [(-14, -184, 9), (-4, -192, 10), (7, -192, 10), (16, -183, 9), (-19, -171, 7), (19, -171, 7)]:
            s.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{H}"/>')
    if st == "bun":
        s.append(f'<circle cx="0" cy="-195" r="7.5" fill="{H}"/>')
    if st == "pony":
        s.append(f'<ellipse cx="17" cy="-170" rx="5" ry="13" fill="{H}"/>')
    if c.get("face") == "oval":
        s.append(f'<circle cx="-13.5" cy="-169" r="3" fill="{K}"/><circle cx="13.5" cy="-169" r="3" fill="{K}"/>')
        s.append(f'<path d="M-13.5 -176 C-13.5 -186 -8 -190 0 -190 C8 -190 13.5 -186 13.5 -176 L13 -166 C12 -157 6 -151 0 -151 C-6 -151 -12 -157 -13 -166 Z" fill="{K}"/>')
    else:
        s.append(f'<circle cx="-15" cy="-168" r="3.5" fill="{K}"/><circle cx="15" cy="-168" r="3.5" fill="{K}"/>')
        s.append(f'<rect x="-15" y="-188" width="30" height="36" rx="14" fill="{K}"/>')
    if st == "short":
        s.append(f'<path d="M-15.5 -174 C-17 -195 17 -195 15.5 -174 C10 -185 -4 -186 -15.5 -174 Z" fill="{H}"/>')
    elif st == "buzz":
        s.append(f'<path d="M-15 -177 C-14 -192 14 -192 15 -177 C8 -185 -8 -185 -15 -177 Z" fill="{H}"/>')
    elif st == "curls":
        for x, y, r in [(-9, -186, 6.5), (0, -188.5, 7), (9, -186, 6.5)]:
            s.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{H}"/>')
    elif st == "long":
        s.append(f'<path d="M-15.5 -170 C-16 -195 16 -195 15.5 -170 C12 -182 2 -185 -5 -181 C-10 -178 -13 -175 -15.5 -170 Z" fill="{H}"/>')
    elif st == "long_up":
        s.append(f'<path d="M-14.5 -172 C-16 -198 16 -198 14.5 -172 C12 -183 7 -188 0 -188 C-7 -188 -12 -183 -14.5 -172 Z" fill="{H}"/>')
    elif st in ("bun", "pony"):
        s.append(f'<path d="M-15.5 -174 C-16 -193 16 -193 15.5 -174 C8 -184 -8 -184 -15.5 -174 Z" fill="{H}"/>')
    if c.get("beard"):
        s.append(f'<path d="M-15 -169 C-15 -145 15 -145 15 -169 C10 -158 -10 -158 -15 -169 Z" fill="{c["hc"] if c["hair"]!="bald" else "#3a2a20"}"/>')
    # brows
    if expr == "worried":
        s.append('<path d="M-10 -176 L-3 -179 M10 -176 L3 -179" fill="none" stroke-width="1.4"/>')
    elif expr != "sleep":
        s.append('<path d="M-9 -178 H-3 M3 -178 H9" fill="none" stroke-width="1.4"/>')
    # eyes
    if expr in ("normal", "happy_open"):
        s.append(f'<ellipse cx="-6" cy="-170" rx="1.8" ry="2.4" fill="{O}" stroke="none"/><ellipse cx="6" cy="-170" rx="1.8" ry="2.4" fill="{O}" stroke="none"/>')
    elif expr == "worried":
        s.append(f'<ellipse cx="-6" cy="-170" rx="2.1" ry="2.9" fill="{O}" stroke="none"/><ellipse cx="6" cy="-170" rx="2.1" ry="2.9" fill="{O}" stroke="none"/>')
    elif expr == "relaxed":
        s.append('<path d="M-8.5 -169 Q-6 -172.5 -3.5 -169 M3.5 -169 Q6 -172.5 8.5 -169" fill="none" stroke-width="1.4"/>')
    elif expr == "sleep":
        s.append('<path d="M-8.5 -170 Q-6 -167.5 -3.5 -170 M3.5 -170 Q6 -167.5 8.5 -170" fill="none" stroke-width="1.4"/>')
    # nose
    s.append('<path d="M0 -167 Q2.6 -163.5 0 -161.5" fill="none" stroke-width="1.3"/>')
    mouth_col = "#f4f3ef" if c.get("beard") else O
    if c.get("mustache"):
        s.append(f'<path d="M-6.5 -160 Q0 -164 6.5 -160 Q0 -158.6 -6.5 -160 Z" fill="{c["hc"]}" stroke-width="1"/>')
    if expr == "worried":
        s.append(f'<path d="M-5 -156.5 q1.7 -1.5 3.3 0 q1.7 1.5 3.3 0 q1.7 -1.5 3.4 0" fill="none" stroke="{mouth_col}" stroke-width="1.3"/>')
    elif expr == "sleep":
        s.append(f'<ellipse cx="0" cy="-156.5" rx="1.6" ry="1.3" fill="{mouth_col}" stroke="none"/>')
    elif not c.get("mustache"):
        s.append(f'<path d="M-4 -157.5 Q0 -155 4 -157.5" fill="none" stroke="{mouth_col}" stroke-width="1.3"/>')
    else:
        s.append(f'<path d="M-3 -156 Q0 -154.5 3 -156" fill="none" stroke="{mouth_col}" stroke-width="1.2"/>')
    if c.get("glasses") == "square":
        s.append('<rect x="-11" y="-174.5" width="10" height="8.5" rx="1.5" fill="none" stroke-width="1.4"/><rect x="1" y="-174.5" width="10" height="8.5" rx="1.5" fill="none" stroke-width="1.4"/><path d="M-1 -171 H1 M-11 -172 H-13.5 M11 -172 H13.5" stroke-width="1.3"/>')
    elif c.get("glasses"):
        s.append('<circle cx="-6" cy="-170" r="4.6" fill="none" stroke-width="1.3"/><circle cx="6" cy="-170" r="4.6" fill="none" stroke-width="1.3"/><path d="M-1.4 -170 H1.4" stroke-width="1.3"/>')
    if c.get("nose_piercing"):
        s.append('<circle cx="2.4" cy="-162" r="1.1" fill="#d9d9d9" stroke="none"/>')
    if c.get("ear_piercing"):
        s.append('<circle cx="-16" cy="-164.5" r="1.3" fill="#d9d9d9" stroke="none"/><circle cx="-17.5" cy="-169" r="1" fill="#d9d9d9" stroke="none"/>')
    if c.get("studs"):
        s.append('<circle cx="-14" cy="-165" r="1.2" fill="#e6e6e6" stroke-width="0.8"/><circle cx="14" cy="-165" r="1.2" fill="#e6e6e6" stroke-width="0.8"/>')
    if c.get("earrings"):
        s.append('<circle cx="-15.5" cy="-163" r="2" fill="#d9b45a" stroke-width="1"/><circle cx="15.5" cy="-163" r="2" fill="#d9b45a" stroke-width="1"/>')
    return "".join(s)


TORSO = "M-20 -138 Q-20 -147 -12 -147 H12 Q20 -147 20 -138 L18 -92 H-18 Z"


def torso(c):
    s = []
    t = c["top"]
    if t == "blazer":
        inner = c.get("inner", "tee")
        s.append(f'<path d="{TORSO}" fill="{c["tc"]}"/>')
        if inner == "tee":
            s.append('<path d="M-6 -147 Q0 -141 6 -147" fill="none" stroke-width="1.2"/>')
        elif inner == "vblouse":
            s.append(f'<path d="M-6 -147 L0 -131 L6 -147 Z" fill="{c["skin"]}" stroke-width="1.2"/>')
        else:
            s.append('<path d="M-6 -147 Q0 -139 6 -147" fill="none" stroke-width="1.2"/>')
        J = c["jc"]
        s.append(f'<path d="M-20 -138 Q-20 -147 -12 -147 H-6 L-2 -122 L-5 -92 H-18 Z" fill="{J}"/>')
        s.append(f'<path d="M20 -138 Q20 -147 12 -147 H6 L2 -122 L5 -92 H18 Z" fill="{J}"/>')
        s.append(f'<path d="M-6 -147 L-10 -134 L-3 -128 M6 -147 L10 -134 L3 -128" fill="none" stroke-width="1.2"/>')
        s.append(f'<circle cx="-4" cy="-110" r="1" fill="{O}" stroke="none"/>')
        if c.get("necklace"):
            s.append('<path d="M-4.6 -147 Q-2.5 -138 0 -137.5 Q2.5 -138 4.6 -147" fill="none" stroke="#b9bec4" stroke-width="0.9"/><circle cx="0" cy="-136.6" r="1.3" fill="#e4e7ea" stroke="#9aa0a7" stroke-width="0.6"/>')
        return "".join(s)
    s.append(f'<path d="{TORSO}" fill="{c["tc"]}"/>')
    if t == "tee":
        s.append('<path d="M-6 -147 Q0 -141 6 -147" fill="none" stroke-width="1.2"/>')
    elif t in ("shirt", "shirt_tie"):
        s.append('<path d="M-7 -147 L0 -140 L7 -147" fill="none" stroke-width="1.2"/>')
        if t == "shirt_tie":
            s.append(f'<path d="M0 -141 L-3 -137 L0 -110 L3 -137 Z" fill="{c["tie"]}" stroke-width="1.1"/>')
        else:
            for y in (-133, -122, -111, -100):
                s.append(f'<circle cx="0" cy="{y}" r="0.9" fill="{O}" stroke="none"/>')
    elif t == "polo":
        s.append('<path d="M-7 -147 L-2 -142 L0 -147 M7 -147 L2 -142 L0 -147 M0 -147 V-134" fill="none" stroke-width="1.2"/>')
        s.append(f'<circle cx="0" cy="-139" r="0.8" fill="{O}" stroke="none"/><circle cx="0" cy="-135" r="0.8" fill="{O}" stroke="none"/>')
    elif t == "blouse":
        s.append('<path d="M-7 -147 Q0 -137 7 -147" fill="none" stroke-width="1.2"/>')
    return "".join(s)


def sleeve(c):
    if c["top"] == "blazer":
        return c["jc"], True
    return c["tc"], c["top"] in ("shirt", "shirt_tie", "blouse")


def arms(c, pose):
    K = c["skin"]
    col, long_ = sleeve(c)
    s = []
    if pose in ("stand", "sleep", "work", "break_l"):
        sides = (-1, 1) if pose != "break_l" else (-1,)
        h = 22 if pose == "work" else 48
        for sd in sides:
            x = 20 if sd > 0 else -29
            hy = -143 + h + 2
            s.append(f'<rect x="{x}" y="-143" width="9" height="{h}" rx="4.5" fill="{K}"/>')
            if long_:
                s.append(f'<rect x="{x}" y="-143" width="9" height="{h-3}" rx="4.5" fill="{col}"/>')
            else:
                s.append(f'<rect x="{x}" y="-143" width="9" height="17" rx="4.5" fill="{col}"/>')
                if c.get("tattoo") and sd < 0 and h > 30:
                    s.append('<path d="M-25.5 -120 q2 2 0 4 q-2 2 0 4 M-26 -107 l3 0" fill="none" stroke-width="1"/>')
            s.append(f'<circle cx="{sd*24.5}" cy="{hy}" r="4.5" fill="{K}"/>')
    return "".join(s)


def arm_cup(c):
    K = c["skin"]
    col, long_ = sleeve(c)
    s = []
    path = "M24 -140 L27 -116 L14 -122"
    s.append(f'<path d="{path}" fill="none" stroke="{O}" stroke-width="{9+2*SW}" stroke-linecap="round" stroke-linejoin="round"/>')
    s.append(f'<path d="{path}" fill="none" stroke="{K}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
    sp = path if long_ else "M24 -140 L25.5 -128"
    s.append(f'<path d="{sp}" fill="none" stroke="{col}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>')
    s.append('<rect x="3" y="-136" width="11" height="13" rx="2" fill="#fafafa"/><path d="M3 -132 h-3 v5 h3" fill="none" stroke-width="1.2"/>')
    s.append(f'<circle cx="14" cy="-124" r="4.5" fill="{K}"/>')
    s.append('<path d="M6 -140 q-2 -3 0 -6 M10 -140 q-2 -3 0 -6" fill="none" stroke="#b5ada2" stroke-width="1.2"/>')
    return "".join(s)


def arms_raised(c):
    K = c["skin"]
    col, long_ = sleeve(c)
    s = []
    for sd in (-1, 1):
        p = f"M{sd*21} -140 C{sd*34} -150 {sd*32} -166 {sd*20} -174"
        s.append(f'<path d="{p}" fill="none" stroke="{O}" stroke-width="{9+2*SW}" stroke-linecap="round"/>')
        s.append(f'<path d="{p}" fill="none" stroke="{K}" stroke-width="9" stroke-linecap="round"/>')
        sp = p if long_ else f"M{sd*21} -140 C{sd*27} -144 {sd*30} -148 {sd*31} -152"
        s.append(f'<path d="{sp}" fill="none" stroke="{col}" stroke-width="9" stroke-linecap="round"/>')
        s.append(f'<circle cx="{sd*19}" cy="-176" r="4.5" fill="{K}"/>')
    s.append('<path d="M23 -192 q3.5 4.5 0 6.5 q-3.5 -2 0 -6.5 z" fill="#9cc7e8" stroke-width="1"/>')
    return "".join(s)


def legs(c, sit):
    b, B, S, K = c["bottom"], c["bc"], c["shoe"], c["skin"]
    s = []
    if not sit:
        if b == "pants":
            s.append(f'<rect x="-17.5" y="-94" width="16" height="88" rx="2" fill="{B}"/><rect x="1.5" y="-94" width="16" height="88" rx="2" fill="{B}"/>')
            if c["top"] in ("shirt", "shirt_tie", "polo"):
                s.append(f'<rect x="-18" y="-96" width="36" height="4" rx="1" fill="{O}" stroke="none"/>')
        else:
            s.append(f'<rect x="-12" y="-64" width="8" height="58" rx="3" fill="{K}"/><rect x="4" y="-64" width="8" height="58" rx="3" fill="{K}"/>')
            s.append(f'<path d="M-18 -94 H18 L22 -58 Q0 -55 -22 -58 Z" fill="{B}"/>')
        s.append(f'<rect x="-19" y="-7" width="17" height="7" rx="3.5" fill="{S}"/><rect x="2" y="-7" width="17" height="7" rx="3.5" fill="{S}"/>')
    else:
        if b == "pants":
            s.append(f'<rect x="-16" y="-46" width="12" height="40" rx="3" fill="{B}"/><rect x="4" y="-46" width="12" height="40" rx="3" fill="{B}"/>')
            s.append(f'<rect x="-18" y="-55" width="36" height="13" rx="5" fill="{B}"/>')
        else:
            s.append(f'<rect x="-14" y="-46" width="9" height="40" rx="3" fill="{K}"/><rect x="5" y="-46" width="9" height="40" rx="3" fill="{K}"/>')
            s.append(f'<rect x="-20" y="-57" width="40" height="15" rx="6" fill="{B}"/>')
        s.append(f'<rect x="-18" y="-7" width="15" height="7" rx="3.5" fill="{S}"/><rect x="3" y="-7" width="15" height="7" rx="3.5" fill="{S}"/>')
    return "".join(s)


def person(cid, pose):
    """pose: stand | work | problem | break | sleep. Origin at the feet (floor)."""
    c = BY[cid]
    sit = pose in ("work", "problem", "sleep")
    dy = 46 if sit else 0
    expr = {"stand": "normal", "work": "happy_open", "problem": "worried", "break": "relaxed", "sleep": "sleep"}[pose]
    s = [f'<g stroke="{O}" stroke-width="{SW}" stroke-linejoin="round" stroke-linecap="round">']
    up = f'<g transform="translate(0 {dy})">'
    sx = ' scale(0.88 1)' if c.get("slim") else ''
    if c["hair"] == "long_up":
        rot = ' transform="rotate(-14 0 -150)"' if pose == "sleep" else ''
        s.append(up + f'<g{rot}><rect x="-18" y="-194" width="36" height="58" rx="15" fill="{c["hc"]}"/></g></g>')
    s.append(f'<g transform="translate(0 {dy}){sx}"><rect x="-4" y="-154" width="8" height="9" fill="{c["skin"]}"/>' + torso(c) + "</g>")
    if c["hair"] == "long_up":
        H = c["hc"]
        s.append(up + f'<path d="M-11 -153 Q-19 -152 -20 -141 L-19 -114 H-12 L-12 -141 Z" fill="{H}"/><path d="M11 -153 Q19 -152 20 -141 L19 -114 H12 L12 -141 Z" fill="{H}"/></g>')
    s.append(f'<g transform="scale(0.9 1)">' + legs(c, sit) + '</g>' if c.get("slim") else legs(c, sit))
    s.append(f'<g transform="translate(0 {dy}){sx}">')
    if pose == "stand":
        s.append(arms(c, "stand"))
    elif pose == "work":
        s.append(arms(c, "work"))
    elif pose == "sleep":
        s.append(arms(c, "sleep"))
    elif pose == "break":
        s.append(arms(c, "break_l"))
    if sx:
        s.append('</g>' + up)
    if pose == "sleep":
        s.append(f'<g transform="rotate(-14 0 -150)">{head(c, expr)}</g>')
    else:
        s.append(head(c, expr))
    if pose == "problem":
        s.append(arms_raised(c))
    if pose == "break":
        s.append(arm_cup(c))
    s.append("</g></g>")
    return "".join(s)


def head_top(cid, pose):
    c = BY[cid]
    top = -203 if c["hair"] == "bun" else (-202 if c["hair"] == "curls" else -195)
    return top + (46 if pose in ("work", "problem", "sleep") else 0)


def badge(state, x, y):
    col = STATE[state]
    if state == "work":
        return (f'<g transform="translate({x} {y})"><rect x="-13" y="-8" width="26" height="16" rx="8" fill="#ffffff" stroke="{O}" stroke-width="1.4"/>'
                f'<circle cx="-6" cy="0" r="2" fill="{col}"/><circle cx="0" cy="0" r="2" fill="{col}"/><circle cx="6" cy="0" r="2" fill="{col}"/></g>')
    if state == "problem":
        return (f'<g transform="translate({x} {y})"><circle r="9" fill="{col}" stroke="{O}" stroke-width="1.4"/>'
                f'<path d="M0 -4.5 V1" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/><circle cy="4.2" r="1.3" fill="#ffffff"/></g>')
    if state == "break":
        return (f'<g transform="translate({x} {y})"><circle r="9" fill="{col}" stroke="{O}" stroke-width="1.4"/>'
                f'<path d="M-4 -3 H2.5 V1 A3 3 0 0 1 -0.5 4 A3 3 0 0 1 -4 1 Z M2.5 -2 H4.5 V1.5 H2.5" fill="#ffffff"/></g>')
    return (f'<g transform="translate({x} {y})" font-family="Inter, sans-serif" font-weight="700" fill="{col}">'
            f'<text font-size="13">z</text><text x="8" y="-8" font-size="10">z</text></g>')


# ---------- props ----------
def chair(x, floor):
    return (f'<g transform="translate({x} {floor})" stroke="{O}" stroke-width="{SW}"><rect x="-15" y="-98" width="30" height="46" rx="5" fill="#3a3a3a"/>'
            f'<rect x="-20" y="-54" width="40" height="5" rx="2" fill="#3a3a3a"/><path d="M0 -49 V-6 M-14 -3 H14" fill="none" stroke-width="2.4"/></g>')


def desk(x, floor, w, monitor_x, state):
    top = floor - 74
    scr = STATE["work"] if state == "work" else (STATE["problem"] if state == "problem" else "#d9d6cf")
    s = [f'<g stroke="{O}" stroke-width="{SW}">']
    mx = monitor_x
    s.append(f'<rect x="{mx}" y="{top-38}" width="48" height="32" rx="3" fill="#2b2b2b"/>')
    s.append(f'<rect x="{mx+3}" y="{top-35}" width="42" height="26" rx="1.5" fill="{scr}" stroke="none"/>')
    if state == "work":
        s.append(f'<path d="M{mx+9} {top-27} H{mx+37} M{mx+9} {top-21} H{mx+31} M{mx+9} {top-15} H{mx+34}" stroke="#ffffff" stroke-width="1.6" opacity=".8"/>')
    if state == "problem":
        s.append(f'<path d="M{mx+24} {top-30} V{top-20}" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><circle cx="{mx+24}" cy="{top-14.5}" r="1.5" fill="#ffffff" stroke="none"/>')
    s.append(f'<path d="M{mx+24} {top-6} V{top}" fill="none" stroke-width="2.4"/>')
    s.append(f'<rect x="{x}" y="{top}" width="{w}" height="5" rx="1.5" fill="#d9c4a5"/>')
    s.append(f'<path d="M{x+6} {top+5} V{floor} M{x+w-6} {top+5} V{floor}" fill="none" stroke-width="2.2"/>')
    s.append("</g>")
    return "".join(s)


def sofa_back(x, floor, w):
    return f'<rect x="{x}" y="{floor-96}" width="{w}" height="50" rx="10" fill="#cdd5cc" stroke="{O}" stroke-width="{SW}"/><rect x="{x-6}" y="{floor-52}" width="{w+12}" height="22" rx="6" fill="#dde3dc" stroke="{O}" stroke-width="{SW}"/>'


def sofa_front(x, floor, w):
    return (f'<g stroke="{O}" stroke-width="{SW}"><rect x="{x-16}" y="{floor-74}" width="16" height="50" rx="6" fill="#cdd5cc"/><rect x="{x+w}" y="{floor-74}" width="16" height="50" rx="6" fill="#cdd5cc"/>'
            f'<path d="M{x-8} {floor-24} V{floor-8} M{x+w+8} {floor-24} V{floor-8}" fill="none" stroke-width="2.6"/></g>')


def page(title, w, h, body, bg="#fbfaf8"):
    import re
    body = re.sub(r'<(\w+)([^<>]*?)\s*/>', r'<\1\2></\1>', body)
    return f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
body{{margin:0}}
a{{color:#2f3e56}}a:hover{{color:#1d2738}}
</style>
</helmet>
<div style="width: {w}px; height: {h}px; box-sizing: border-box; padding: 40px; display: flex; flex-direction: column; gap: 24px; background: {bg}; font-family: Inter, system-ui, sans-serif; color: #2b2b2b">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''


def header(kicker, h1, p):
    return (f'<div style="display: flex; flex-direction: column; gap: 8px">'
            f'<p style="margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: #8b857c">{kicker}</p>'
            f'<h1 style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.5px">{h1}</h1>'
            f'<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #6b665f; max-width: 820px">{p}</p></div>')


# ---------- Board 1: equipo ----------
cards = []
for c in CAST:
    svg = (f'<svg viewBox="-45 -210 90 216" width="132" height="317" role="img" aria-label="{c["l1"]}, {c["l2"]}" style="display: block; margin: 0 auto">'
           f'<path d="M-40 0 H40" stroke="#d5d0c6" stroke-width="1.5"/>{person(c["id"], "stand")}</svg>')
    cards.append(f'<div style="display: flex; flex-direction: column; gap: 10px; background: #f4f3ef; border-radius: 14px; padding: 14px 6px 14px">{svg}'
                 f'<div style="display: flex; flex-direction: column; gap: 2px; padding: 0 8px"><p style="margin: 0; font-size: 13px; font-weight: 600">{c["l1"]}</p>'
                 f'<p style="margin: 0; font-size: 12px; color: #6b665f">{c["l2"]}</p></div></div>')
body1 = header("Minimalista · personajes", "El equipo",
               "Cuerpo entero, contorno fino y parejo, colores apagados de oficina. Rasgos simples pero humanos: cejas, ojos, nariz y boca, más lentes, rulos, barba, bigote, tatuajes y piercings.")
body1 += f'<div style="display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 12px">{"".join(cards)}</div>'
open(f"{OUT}/Main.dc.html", "w").write(page("El equipo", 1360, 640, body1))

# ---------- Board 2: estados ----------
def state_card(cid, pose, label, desc, bgc):
    floor = 0
    parts = [f'<path d="M-90 0 H90" stroke="#d5d0c6" stroke-width="1.5"/>']
    px = -18
    if pose in ("work", "problem"):
        parts.append(chair(px, 0))
        parts.append(f'<g transform="translate({px} 0)">{person(cid, pose)}</g>')
        parts.append(desk(-70, 0, 140, 22, pose))
        parts.append(badge(pose, px + 26, head_top(cid, pose) - 4))
    elif pose == "break":
        px = 0
        parts.append(f'<g transform="translate({px} 0)">{person(cid, pose)}</g>')
        parts.append(badge("break", px + 28, head_top(cid, pose) - 4))
    else:
        px = 0
        parts.append(sofa_back(-70, 0, 140))
        parts.append(f'<g transform="translate({px} 0)">{person(cid, "sleep")}</g>')
        parts.append(sofa_front(-70, 0, 140))
        parts.append(badge("sleep", 20, head_top(cid, "sleep") - 2))
    svg = f'<svg viewBox="-90 -215 180 222" width="100%" height="380" role="img" aria-label="{label}" style="display: block">{"".join(parts)}</svg>'
    return (f'<div style="display: flex; flex-direction: column; background: {bgc}; border-radius: 16px; padding: 16px 16px 18px; gap: 12px">{svg}'
            f'<div style="display: flex; align-items: center; gap: 8px"><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="{STATE[pose]}"></circle></svg>'
            f'<p style="margin: 0; font-size: 16px; font-weight: 600">{label}</p></div>'
            f'<p style="margin: 0; font-size: 13px; color: #6b665f">{desc}</p></div>')

body2 = header("Minimalista · estados", "Cómo se ve cada estado",
               "El estado se lee en el gesto, en la pantalla y en un globito chico arriba de la cabeza.")
body2 += ('<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px">'
          + state_card("c2", "work", "Trabajando", "Sentado, tecleando, pantalla en verde", "#eef5f0")
          + state_card("c5", "problem", "Con un problema", "Se agarra la cabeza, pantalla en rojo", "#f8eded")
          + state_card("c3", "break", "En descanso", "De pie con un café", "#f8f1e6")
          + state_card("c4", "sleep", "Pausado", "Dormido en el sillón", "#efeef5")
          + "</div>")
open(f"{OUT}/Estados.dc.html", "w").write(page("Estados", 1360, 700, body2))

# ---------- Board 3: oficina ----------
W, Hs = 1120, 620
sc = []
sc.append(f'<rect width="{W}" height="440" fill="#f4f3ef"/><rect y="440" width="{W}" height="180" fill="#e8e5df"/><path d="M0 440 H{W}" stroke="#d5d0c6" stroke-width="2"/>')
sc.append('<path d="M575 30 V440 M835 30 V440" stroke="#dcd7cd" stroke-width="4"/>')
sc.append('<g font-family="Inter, sans-serif" font-size="12" font-weight="600" letter-spacing="2" fill="#8b857c"><text x="28" y="44">TRABAJO</text><text x="600" y="44">CAFÉ</text><text x="860" y="44">DESCANSO</text></g>')
# wall decor
for lx in (70, 250, 430):
    sc.append(f'<path d="M{lx} 0 V150" stroke="{O}" stroke-width="1.5"/><path d="M{lx-18} 166 A18 18 0 0 1 {lx+18} 166 Z" fill="{O}"/>')
sc.append(f'<rect x="140" y="200" width="70" height="90" fill="#ffffff" stroke="{O}" stroke-width="1.6"/><circle cx="175" cy="235" r="14" fill="#c9775a"/><path d="M152 272 H198" stroke="{O}" stroke-width="1.6"/>')
sc.append(f'<rect x="320" y="210" width="60" height="70" fill="#ffffff" stroke="{O}" stroke-width="1.6"/><rect x="333" y="224" width="34" height="34" fill="#9bb0a0"/>')
sc.append(f'<circle cx="705" cy="130" r="22" fill="#ffffff" stroke="{O}" stroke-width="1.6"/><path d="M705 130 V116 M705 130 L714 135" stroke="{O}" stroke-width="1.6" stroke-linecap="round"/>')
sc.append(f'<path d="M615 250 H805" stroke="{O}" stroke-width="1.6"/>')
for cx in (630, 648, 666):
    sc.append(f'<rect x="{cx}" y="236" width="12" height="14" rx="2" fill="#ffffff" stroke="{O}" stroke-width="1.4"/>')
sc.append(f'<rect x="760" y="220" width="30" height="30" rx="2" fill="#9bb0a0" stroke="{O}" stroke-width="1.4"/>')
sc.append(f'<rect x="880" y="90" width="200" height="150" fill="#e3ecef" stroke="{O}" stroke-width="1.6"/><path d="M980 90 V240" stroke="{O}" stroke-width="1.6"/>')
# plant right corner
sc.append(f'<g stroke="{O}" stroke-width="1.6"><path d="M1094 520 C1074 494 1076 468 1090 452 C1100 470 1100 496 1094 520 Z" fill="#7f9c86"/><path d="M1094 520 C1112 500 1116 478 1108 462 C1098 478 1096 500 1094 520 Z" fill="#9bb0a0"/><path d="M1080 520 H1108 L1104 560 H1084 Z" fill="#ffffff"/></g>')
# work zone
F = 560
desks = [(20, "c2", "work"), (200, "c5", "problem"), (380, "c8", "work")]
for dx, cid, stt in desks:
    sc.append(chair(dx + 50, F))
for dx, cid, stt in desks:
    sc.append(f'<g transform="translate({dx+50} {F})">{person(cid, stt)}</g>')
for dx, cid, stt in desks:
    sc.append(desk(dx, F, 160, dx + 92, stt))
    sc.append(badge(stt, dx + 76, F + head_top(cid, stt) - 4))
# cafe
sc.append(f'<g stroke="{O}" stroke-width="1.6"><rect x="760" y="424" width="34" height="42" rx="3" fill="#2b2b2b"/><rect x="766" y="430" width="22" height="7" rx="1.5" fill="#e8973a" stroke="none"/>'
          f'<rect x="600" y="472" width="212" height="88" fill="#ffffff"/><rect x="596" y="466" width="220" height="7" rx="1.5" fill="#d9c4a5"/></g>')
F2 = 600
for cx, cid in ((660, "c1"), (760, "c6")):
    sc.append(f'<g transform="translate({cx} {F2})">{person(cid, "break")}</g>')
    sc.append(badge("break", cx + 28, F2 + head_top(cid, "break") - 4))
# rest
sc.append(sofa_back(880, F, 180))
sc.append(f'<g transform="translate(940 {F})">{person("c4", "sleep")}</g>')
sc.append(f'<g transform="translate(1010 {F})">{person("c7", "work").replace("happy_open","")}</g>' if False else "")
sc.append(sofa_front(880, F, 180))
sc.append(badge("sleep", 960, F + head_top("c4", "sleep") - 2))
scene = f'<svg viewBox="0 0 {W} {Hs}" width="{W}" height="{Hs}" role="img" aria-label="Oficina minimalista con el equipo trabajando, en el café y descansando" style="display: block; border-radius: 16px">{"".join(sc)}</svg>'
chips = ""
for k, lab in (("work", "Trabajando"), ("problem", "Con un problema"), ("break", "En descanso"), ("sleep", "Pausado")):
    chips += (f'<span style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; background: #ffffff; border: 1.5px solid #e2ddd3; border-radius: 999px; font-size: 14px; font-weight: 500">'
              f'<svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="{STATE[k]}"></circle></svg>{lab}</span>')
body3 = header("Minimalista · escena", "La oficina",
               "Pared y piso lisos, escritorios de madera clara con patas finas, pantallas planas, lámparas colgantes, dos cuadros, una planta. Nada más.")
body3 += scene + f'<div style="display: flex; flex-wrap: wrap; gap: 10px">{chips}</div>'
open(f"{OUT}/Oficina.dc.html", "w").write(page("La oficina", 1200, 900, body3))
print("ok")

# ---------- Board 4: Daniela ----------
stand_svg = (f'<svg viewBox="-60 -215 120 222" width="100%" height="380" role="img" aria-label="Daniela de pie" style="display: block">'
             f'<path d="M-60 0 H60" stroke="#d5d0c6" stroke-width="1.5"/>{person("dani", "stand")}</svg>')
stand_card = (f'<div style="display: flex; flex-direction: column; background: #f4f3ef; border-radius: 16px; padding: 16px 16px 18px; gap: 12px">{stand_svg}'
              f'<p style="margin: 0; font-size: 16px; font-weight: 600">De pie</p><p style="margin: 0; font-size: 13px; color: #6b665f">Saco azul, blusa blanca, lentes cuadrados, cadenita de plata</p></div>')
body4 = header("Minimalista · vos", "Daniela",
               "Pelo largo, lacio y oscuro peinado hacia atrás, aritos chiquitos, lentes cuadrados, cadenita de plata, saco azul marino y blusa blanca.")
body4 += ('<div style="display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px">' + stand_card
          + state_card("dani", "work", "Trabajando", "Tecleando, pantalla en verde", "#eef5f0")
          + state_card("dani", "problem", "Con un problema", "Manos en la cabeza", "#f8eded")
          + state_card("dani", "break", "En descanso", "Con un café", "#f8f1e6")
          + state_card("dani", "sleep", "Pausado", "Dormida en el sillón", "#efeef5")
          + "</div>")
open(f"{OUT}/Daniela.dc.html", "w").write(page("Daniela", 1360, 680, body4))
