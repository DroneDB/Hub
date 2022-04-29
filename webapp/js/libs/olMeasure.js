import {Control} from 'ol/control';

class MeasureControls extends Control {
    /**
     * @param {Object} [opt_options] Control options.
     */
    constructor(opt_options) {
      const options = opt_options || {};
  
      const btnLength = document.createElement('button');
      btnLength.innerHTML = '<img title="Measure Length" src="/images/measure-length.svg"/>';
      const btnArea = document.createElement('button');
      btnArea.innerHTML = '<img title="Measure Area" src="/images/measure-area.svg"/>';
      const btnErase = document.createElement('button');
      btnErase.innerHTML = '<img title="Erase Measurement" src="/images/measure-erase.svg"/>';

      const element = document.createElement('div');
      element.className = 'ol-measure-control ol-unselectable ol-control';
      element.appendChild(btnLength);
      element.appendChild(btnArea);
      element.appendChild(btnErase);
      
      super({
        element: element,
        target: options.target,
      });
  
      btnLength.addEventListener('click', this.handleMeasureLength.bind(this), false);
      btnArea.addEventListener('click', this.handleMeasureArea.bind(this), false);
      btnErase.addEventListener('click', this.handleErase.bind(this), false);
    }
  
    handleMeasureLength() {
        const map = this.getMap();

    }

    handleMeasureArea() {
        const map = this.getMap();
    }

    handleErase() {

    }
}

export {
    MeasureControls
};