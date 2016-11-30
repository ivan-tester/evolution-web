import React, {Component} from 'react';
import T from 'i18n-react';
import PureRenderMixin from 'react-addons-pure-render-mixin';
import * as MDL from 'react-mdl';
import {connect} from 'react-redux';
import cn from 'classnames';

import {Dialog, DialogActions} from '../utils/Dialog.jsx';

const INITIAL_STATE = {
  show: false
  , name: Math.floor(Math.random() * 0xFFFFFF)
};

export class RoomCreateDialog extends Component {
  constructor(props) {
    super(props);
    //this.shouldComponentUpdate = PureRenderMixin.shouldComponentUpdate.bind(this);
    this.state = INITIAL_STATE;
    this.close = this.close.bind(this);
  }

  static propTypes = {
    onCreateRoom: React.PropTypes.func.isRequired
  };

  close() {
    this.setState({show: false})
  }

  render() {
    return <span>

      <MDL.Button id="Rooms$create" onClick={() => this.setState({show: true})}>{T.translate('App.Rooms$Create')}</MDL.Button>

      <Dialog show={this.state.show} onBackdropClick={this.close}>
        <MDL.DialogTitle>{T.translate('App.Rooms_New_room')}</MDL.DialogTitle>
        <MDL.DialogContent>
          <MDL.Textfield floatingLabel label={T.translate('App.Rooms_New_room_name')} value={this.state.name}
                         onChange={(e) => this.setState({name: e.target.value})}/>
        </MDL.DialogContent>
        <DialogActions>
          <MDL.Button id='RoomCreateDialog$ok' type='button' raised primary onClick={() => {
            this.props.onCreateRoom({
              name: this.state.name
            });
            this.close();
          }}>{T.translate('App.Rooms$Create')}</MDL.Button>
          {/*<MDL.Button id='RoomCreateDialog$cancel' type='button' raised onClick={this.close}>Cancel</MDL.Button>*/}
        </DialogActions>
      </Dialog>
      </span>;
  }
}