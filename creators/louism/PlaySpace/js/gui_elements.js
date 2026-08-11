class GraphicalUserInterface {
  #angle = {
    number: 15,
    active: false,
    target: { x: 0, y: 0 },
    smooth: { x: 0, y: 0 },
  };
  #toggle = 0.0;
  #value = 0.0;
  #width = 0.0;
  #press = 0.0;
  #labelBuffer = null;
  #labelCacheKey = null;
  #selectionAnimating = false;
  #selectionBox = { x: 0, width: 0, alpha: 0 };

  constructor(label = "", texture, shader) {
    this.label = label;
    this.texture = texture;
    this.shader = shader;
    this.anchor = "center";
    this.armed = false;
    this.pressNudge = 4;
    this.pressTilt = 1.35;
    this.tiltEnabled = true;
    this.marks = { top: "", right: "", bottom: "", left: "" };
    this.selection = null;
    this.labelOpacity = null;
    this.labelScales = null;
    this.labelRotations = null;
    this.labelOffsets = null;
    this.valueVisible = false;
    this.valueMinimum = 0;
    this.valueMaximum = 100;
    this.valueDecimals = 0;
    this.valueUnit = "";
    this.bounds = null;
  }

  update(time = 0, pointer = [0, 0], pointerActive = 1) {
    this.time = time;
    this.pointer = pointer;
    if (this.shader != null) {
      this.shader.setUniform("u_time", this.time);
      this.shader.setUniform("u_mouse", this.pointer);
      this.shader.setUniform("u_pointer", pointerActive);
      this.shader.setUniform("u_resolution", [
        this.texture.width,
        this.texture.height,
      ]);
      this.shader.setUniform("texture0", this.texture);
    }
  }

  #fitWidth(w, h) {
    push();
    textFont(scene.font);
    textSize(h / 1.25);
    let contentWidth = textWidth(this.label);
    if (this.valueVisible) {
      contentWidth += textWidth(this.#valueLabel()) + h * 1.5;
    } else {
      contentWidth += h;
    }
    let targetWidth = max(w, contentWidth);
    pop();

    this.#width =
      this.#width > 0 ? animateData(this.#width, targetWidth, 0.5) : targetWidth;

    return this.#width;
  }

  #valueLabel() {
    let value = map(
      this.#value,
      0,
      1,
      this.valueMinimum,
      this.valueMaximum,
    );
    return value.toFixed(this.valueDecimals) + this.valueUnit;
  }

  #anchorX(x, w, fitWidth) {
    if (this.anchor == "left") {
      return x + (fitWidth - w) / 2;
    }

    if (this.anchor == "right") {
      return x + (w - fitWidth) / 2;
    }

    return x;
  }

  #clipLabel(label, maxWidth, textSizeValue, align = "start") {
    push();
    textFont(scene.font);
    textSize(textSizeValue);
    if (textWidth(label) <= maxWidth) {
      pop();
      return label;
    }

    let ellipsis = "...";
    let clipped = label;
    while (clipped.length > 0 && textWidth(ellipsis + clipped) > maxWidth) {
      clipped =
        align == "end"
          ? clipped.substring(1)
          : clipped.substring(0, clipped.length - 1);
    }
    pop();

    if (clipped.length == 0) return ellipsis;
    return align == "end" ? ellipsis + clipped : clipped + ellipsis;
  }

  #selectionColor(color, alpha = 1) {
    color ||= { hue: 0, saturation: 0, brightness: 0.8, opacity: 0.5 };
    let rgb = hsvToRgbValues(color);
    let opacity = (color?.opacity ?? 0.8) * alpha;
    return `rgba(${rgb[0] * 255}, ${rgb[1] * 255}, ${rgb[2] * 255}, ${opacity})`;
  }

  #labelStateKey(w, h) {
    let serializeArray = (values) =>
      values?.map((value) =>
        typeof value == "object"
          ? `${value?.x ?? ""},${value?.y ?? ""}`
          : value,
      ).join(",") ?? "";
    let selection = this.selection;
    let selectionStops = selection?.colorStops?.map((stop) => {
      let color = stop.color || {};
      return [
        stop.offset,
        color.hue,
        color.saturation,
        color.brightness,
        color.opacity,
      ].join(",");
    }).join(";") ?? "";

    return [
      ceil(w),
      ceil(h),
      this.label,
      this.valueVisible ? this.#valueLabel() : "",
      serializeArray(this.labelOpacity),
      serializeArray(this.labelScales),
      serializeArray(this.labelRotations),
      serializeArray(this.labelOffsets),
      this.marks.top,
      this.marks.right,
      this.marks.bottom,
      this.marks.left,
      selection?.start ?? "",
      selection?.end ?? "",
      selection?.caret ?? "",
      selection?.gradientStart ?? "",
      selection?.gradientEnd ?? "",
      selectionStops,
    ].join("|");
  }

  #draw(x, y, w, h, r, drawLabel = true) {
    let drawY = y + this.pressNudge * this.#press;
    let origin =
      webglVersion != "p2d" ? { x: width / 2, y: height / 2 } : { x: 0, y: 0 };

    let edge = {
      left: origin.x + x - w / 2,
      right: origin.x + x + w / 2,
      top: origin.y + drawY - h / 2,
      bottom: origin.y + drawY + h / 2,
    };
    this.bounds = { x, y: drawY, w, h };

    if (
      this.tiltEnabled &&
      this.pointer[0] > edge.left &&
      this.pointer[0] < edge.right &&
      this.pointer[1] > edge.top &&
      this.pointer[1] < edge.bottom
    ) {
      this.#angle.active = true;
      this.#angle.target.x = map(
        this.pointer[0],
        edge.left,
        edge.right,
        -this.#angle.number,
        this.#angle.number,
      );
      this.#angle.target.y = map(
        this.pointer[1],
        edge.top,
        edge.bottom,
        this.#angle.number,
        -this.#angle.number,
      );
    } else {
      this.#angle.active = false;
      this.#angle.target.x = 0;
      this.#angle.target.y = 0;
    }

    this.#press = animateData(this.#press, this.armed ? 1 : 0, 0.5);
    let tilt = map(this.#press, 0, 1, 1, this.pressTilt);
    this.#angle.smooth = {
      x: animateData(this.#angle.smooth.x, this.#angle.target.x * tilt, 0.25),
      y: animateData(this.#angle.smooth.y, this.#angle.target.y * tilt, 0.25),
    };

    push();
    shader(this.shader);

    translate(x, drawY);
    rotateY(this.#angle.smooth.x);
    rotateX(this.#angle.smooth.y);
    rectMode(CENTER);
    rect(0, 0, w, h, r);

    resetShader();
    if (drawLabel) {
      translate(0, 0, 4);
      this.#drawLabel(w, h);
    }
    pop();
  }

  #drawLabel(w, h) {
    let bufferWidth = max(1, ceil(w));
    let bufferHeight = max(1, ceil(h));
    let resized = false;

    if (
      this.#labelBuffer == null ||
      this.#labelBuffer.width != bufferWidth ||
      this.#labelBuffer.height != bufferHeight
    ) {
      this.#labelBuffer = createGraphics(bufferWidth, bufferHeight);
      this.#labelBuffer.pixelDensity(1);
      resized = true;
    }

    let labelCacheKey = this.#labelStateKey(w, h);
    if (
      !resized &&
      labelCacheKey == this.#labelCacheKey &&
      !this.#selectionAnimating
    ) {
      imageMode(CENTER);
      image(this.#labelBuffer, 0, 0, w, h);
      return;
    }

    this.#labelBuffer.clear();
    this.#labelBuffer.textFont(scene.font);
    this.#labelBuffer.textSize(h / 1.25);
    this.#labelBuffer.textAlign(CENTER, CENTER);
    this.#labelBuffer.noStroke();

    let characterWidths = Array.from(this.label).map((character) =>
      this.#labelBuffer.textWidth(character),
    );
    let labelWidth = characterWidths.reduce((sum, value) => sum + value, 0);
    let labelLeft = bufferWidth / 2 - labelWidth / 2;
    let selectionTarget = {
      x: this.#selectionBox.x,
      width: this.#selectionBox.width,
      alpha: 0,
    };

    if (this.selection != null) {
      let selectionX =
        labelLeft +
        characterWidths
          .slice(0, this.selection.start)
          .reduce((sum, value) => sum + value, 0);
      let caretWidth = max(3, h * 0.06);
      let targetWidth = this.selection.caret
        ? caretWidth
        : characterWidths
            .slice(this.selection.start, this.selection.end)
            .reduce((sum, value) => sum + value, 0) + 4;
      let targetX = this.selection.caret
        ? selectionX - targetWidth / 2
        : selectionX - 2;
      selectionTarget = { x: targetX, width: targetWidth, alpha: 1 };

      if (this.#selectionBox.alpha < 0.01) {
        this.#selectionBox.x = targetX;
        this.#selectionBox.width = targetWidth;
      } else {
        this.#selectionBox.x = animateData(this.#selectionBox.x, targetX, 0.4);
        this.#selectionBox.width = animateData(
          this.#selectionBox.width,
          targetWidth,
          0.4,
        );
      }
      this.#selectionBox.alpha = animateData(this.#selectionBox.alpha, 1, 0.5);
    } else {
      this.#selectionBox.alpha = animateData(this.#selectionBox.alpha, 0, 0.5);
    }

    this.#selectionAnimating =
      abs(this.#selectionBox.x - selectionTarget.x) > 0.1 ||
      abs(this.#selectionBox.width - selectionTarget.width) > 0.1 ||
      abs(this.#selectionBox.alpha - selectionTarget.alpha) > 0.01;

    if (this.#selectionBox.alpha > 0.01) {
      let context = this.#labelBuffer.drawingContext;
      let stops = this.selection?.colorStops || [];
      let gradientStart = this.selection?.gradientStart ?? this.selection?.start;
      let gradientEnd = this.selection?.gradientEnd ?? this.selection?.end;
      let gradientLeft =
        labelLeft +
        characterWidths
          .slice(0, gradientStart)
          .reduce((sum, value) => sum + value, 0);
      let gradientWidth = characterWidths
        .slice(gradientStart, gradientEnd)
        .reduce((sum, value) => sum + value, 0);
      let gradientRight = gradientLeft + max(1, gradientWidth);
      let paint = this.#selectionColor(
        stops[0]?.color,
        this.#selectionBox.alpha,
      );

      if (stops.length > 1) {
        paint = context.createLinearGradient(
          gradientLeft,
          0,
          gradientRight,
          0,
        );
        for (let stop of stops) {
          paint.addColorStop(
            constrain(stop.offset, 0, 1),
            this.#selectionColor(stop.color, this.#selectionBox.alpha),
          );
        }
      }

      context.save();
      context.fillStyle = paint;
      context.beginPath();
      context.roundRect(
        this.#selectionBox.x,
        bufferHeight * 0.08,
        this.#selectionBox.width,
        bufferHeight * 0.72 + 8,
        h * 0.08,
      );
      context.fill();
      context.restore();
    }

    if (this.valueVisible) {
      let labelPadding = h * 0.5;
      let labelY = bufferHeight / 2 - h / 8;
      this.#labelBuffer.fill(255);
      this.#labelBuffer.textAlign(LEFT, CENTER);
      this.#labelBuffer.text(this.label, labelPadding, labelY);
      this.#labelBuffer.textAlign(RIGHT, CENTER);
      this.#labelBuffer.text(
        this.#valueLabel(),
        bufferWidth - labelPadding,
        labelY,
      );
    } else if (
      this.labelOpacity != null &&
      this.labelOpacity.length == characterWidths.length
    ) {
      let characterX = labelLeft;
      this.#labelBuffer.textAlign(LEFT, CENTER);
      for (let i = 0; i < characterWidths.length; i++) {
        let characterCenter = characterX + characterWidths[i] / 2;
        let offset = this.labelOffsets?.[i] || { x: 0, y: 0 };
        this.#labelBuffer.fill(255, this.labelOpacity[i]);
        this.#labelBuffer.push();
        this.#labelBuffer.translate(
          characterCenter + offset.x * h,
          bufferHeight / 2 - h / 8 + offset.y * h,
        );
        this.#labelBuffer.rotate(this.labelRotations?.[i] || 0);
        this.#labelBuffer.scale(this.labelScales?.[i] || 1);
        this.#labelBuffer.textAlign(CENTER, CENTER);
        this.#labelBuffer.text(
          this.label[i],
          0,
          0,
        );
        this.#labelBuffer.pop();
        characterX += characterWidths[i];
      }
    } else {
      this.#labelBuffer.fill(255);
      this.#labelBuffer.textAlign(CENTER, CENTER);
      this.#labelBuffer.text(
        this.label,
        bufferWidth / 2,
        bufferHeight / 2 - h / 8,
      );
    }

    this.#drawMarks(this.#labelBuffer, w, h);
    this.#labelCacheKey = labelCacheKey;

    imageMode(CENTER);
    image(this.#labelBuffer, 0, 0, w, h);
  }

  #drawMarks(buffer, w, h) {
    let markSize = min(w, h);
    let textSizeValue = markSize * 0.75;

    buffer.textSize(textSizeValue);

    if (this.marks.top != "") {
      buffer.text(
        this.marks.top,
        w / 2,
        markSize * 0.55 - markSize / 8,
      );
    }
    if (this.marks.right != "") {
      buffer.text(
        this.marks.right,
        w - markSize * 0.55,
        h / 2 - markSize / 8,
      );
    }
    if (this.marks.bottom != "") {
      buffer.text(
        this.marks.bottom,
        w / 2,
        h - markSize * 0.55 - markSize / 8,
      );
    }
    if (this.marks.left != "") {
      buffer.text(
        this.marks.left,
        markSize * 0.55,
        h / 2 - markSize / 8,
      );
    }
  }

  hitTest(pointerX = mouseX, pointerY = mouseY) {
    if (this.bounds == null) {
      return false;
    }

    let pointer = {
      x: pointerX - width / 2,
      y: pointerY - height / 2,
    };

    return (
      pointer.x >= this.bounds.x - this.bounds.w / 2 &&
      pointer.x <= this.bounds.x + this.bounds.w / 2 &&
      pointer.y >= this.bounds.y - this.bounds.h / 2 &&
      pointer.y <= this.bounds.y + this.bounds.h / 2
    );
  }

  button(
    x = 0,
    y = 0,
    w = 128,
    h = 128,
    r = 0.0,
    value = 0.0,
    hue = 0,
    saturation = 0,
    brightness = 100,
  ) {
    this.#toggle = animateData(this.#toggle, value, 0.5);
    let fitWidth = this.#fitWidth(w, h);
    let drawX = this.#anchorX(x, w, fitWidth);
    this.shader.setUniform("u_hsb", [hue, saturation, brightness]);
    this.shader.setUniform("u_gradient", 0.0);
    this.shader.setUniform("u_white_backdrop", 0.0);
    this.shader.setUniform("u_toggle", this.#toggle);
    this.shader.setUniform("u_value", 0.0);
    this.shader.setUniform("u_axis", 0.0);
    this.shader.setUniform("u_dimension", [fitWidth, h, r]);
    this.#draw(drawX, y, fitWidth, h, r);
  }

  slider(
    x = 0,
    y = 0,
    w = 128,
    h = 128,
    r = 0.0,
    value = 0.0,
    hue = 0,
    saturation = 0,
    brightness = 100,
  ) {
    this.#value = animateData(this.#value, value, 0.5);
    let fitWidth = this.#fitWidth(w, h);
    let drawX = this.#anchorX(x, w, fitWidth);
    this.shader.setUniform("u_hsb", [hue, saturation, brightness]);
    this.shader.setUniform("u_gradient", 0.0);
    this.shader.setUniform("u_white_backdrop", 0.0);
    this.shader.setUniform("u_value", this.#value);
    this.shader.setUniform("u_toggle", 0.0);
    this.shader.setUniform("u_axis", 0.0);
    this.shader.setUniform("u_dimension", [fitWidth, h, r]);
    this.#draw(drawX, y, fitWidth, h, r);
  }

  gradientSlider(
    x = 0,
    y = 0,
    w = 128,
    h = 128,
    r = 0.0,
    value = 0.0,
    colorStart = [0, 0, 0],
    colorEnd = [1, 1, 1],
  ) {
    this.#value = animateData(this.#value, value, 0.5);
    let fitWidth = this.#fitWidth(w, h);
    let drawX = this.#anchorX(x, w, fitWidth);
    this.shader.setUniform("u_gradient", 1.0);
    this.shader.setUniform("u_white_backdrop", 0.0);
    this.shader.setUniform("u_color0", colorStart);
    this.shader.setUniform("u_color1", colorEnd);
    this.shader.setUniform("u_value", this.#value);
    this.shader.setUniform("u_toggle", 0.0);
    this.shader.setUniform("u_axis", 0.0);
    this.shader.setUniform("u_dimension", [fitWidth, h, r]);
    this.#draw(drawX, y, fitWidth, h, r);
  }

  gradientPanel(
    x = 0,
    y = 0,
    w = 320,
    h = 400,
    r = 0.0,
    gradientCenter = [0.5, 0.6],
    gradientSize = [0.8, 0.64],
    gradientRadius = 0.1,
    colorTopLeft = [0, 1, 1],
    colorTopRight = [1, 0, 1],
    colorBottomLeft = [1, 1, 0],
    colorBottomRight = [0.5, 0.5, 0.5],
  ) {
    this.shader.setUniform("u_gradient", 3.0);
    this.shader.setUniform("u_white_backdrop", 0.8);
    this.shader.setUniform("u_gradient_center", gradientCenter);
    this.shader.setUniform("u_gradient_size", gradientSize);
    this.shader.setUniform("u_gradient_radius", gradientRadius);
    this.shader.setUniform("u_color0", colorTopLeft);
    this.shader.setUniform("u_color1", colorTopRight);
    this.shader.setUniform("u_color2", colorBottomLeft);
    this.shader.setUniform("u_color3", colorBottomRight);
    this.shader.setUniform("u_value", 0.0);
    this.shader.setUniform("u_toggle", 1.0);
    this.shader.setUniform("u_axis", 0.0);
    this.shader.setUniform("u_dimension", [w, h, r]);
    this.#draw(x, y, w, h, r, false);
  }

  verticalSlider(
    x = 0,
    y = 0,
    w = 128,
    h = 128,
    r = 0.0,
    value = 0.0,
    hue = 0,
    saturation = 0,
    brightness = 100,
  ) {
    this.#value = animateData(this.#value, value, 0.5);
    this.shader.setUniform("u_hsb", [hue, saturation, brightness]);
    this.shader.setUniform("u_gradient", 0.0);
    this.shader.setUniform("u_white_backdrop", 0.0);
    this.shader.setUniform("u_value", this.#value);
    this.shader.setUniform("u_toggle", 0.0);
    this.shader.setUniform("u_axis", 1.0);
    this.shader.setUniform("u_dimension", [w, h, r]);
    this.#draw(x, y, w, h, r);
  }

  field(
    x = 0,
    y = 0,
    w = 256,
    h = 128,
    r = 0.0,
    hue = 0,
    saturation = 0,
    brightness = 100,
    clipLabel = true,
  ) {
    let fullLabel = this.label;
    if (clipLabel) {
      this.label = this.#clipLabel(fullLabel, max(0, w - h), h / 1.25, "end");
    }
    this.shader.setUniform("u_hsb", [hue, saturation, brightness]);
    this.shader.setUniform("u_gradient", 0.0);
    this.shader.setUniform("u_white_backdrop", 0.0);
    this.shader.setUniform("u_value", 0.0);
    this.shader.setUniform("u_toggle", 0.0);
    this.shader.setUniform("u_axis", 0.0);
    this.shader.setUniform("u_dimension", [w, h, r]);
    this.#draw(x, y, w, h, r);
    this.label = fullLabel;
  }

  surface(
    x = 0,
    y = 0,
    w = 256,
    h = 128,
    r = 0.0,
    hue = 0,
    saturation = 0,
    brightness = 100,
  ) {
    this.shader.setUniform("u_hsb", [hue, saturation, brightness]);
    this.shader.setUniform("u_gradient", 0.0);
    this.shader.setUniform("u_white_backdrop", 0.0);
    this.shader.setUniform("u_value", 0.0);
    this.shader.setUniform("u_toggle", 0.0);
    this.shader.setUniform("u_axis", 0.0);
    this.shader.setUniform("u_dimension", [w, h, r]);
    this.#draw(x, y, w, h, r, false);
  }
}
