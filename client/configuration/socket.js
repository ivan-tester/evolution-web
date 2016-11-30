import logger from '~/shared/utils/logger';
import io from 'socket.io-client';
import {serverToClient, loginUserRequest, clientDisconnectSelf} from '../../shared/actions/actions'

export const makeSocketClient = (url, options) => io(url, options);

export const socketMiddleware = socket => store => next => action => {
  const nextResult = next(action);
  if (action.meta && action.meta.server) {
    //const clientId = store.getState().get('clientId');
    //socket.emit('action', objectAssign({}, action, {clientId}));
    action.meta.user = store.getState().get('user');
    logger.silly('Client Send:', action.type);
    socket.emit('action', action);
  }
  return nextResult;
};

export const socketStore = (socket, store) => {
  socket.on('connect', () => {
    //console.log('Client store:',store.getState());
    const user = store.getState().get('user');
    if (user != null) {
      const previousLocation = store.getState().getIn(['routing', 'locationBeforeTransitions', 'pathname'], '/');
      store.dispatch(loginUserRequest(previousLocation));
    }
  });
  //socket.on('connect_error', function(error) {
  //  console.log('client:connect_error', error);
  //});
  socket.on('disconnect', (reason) => {
    //console.log('client:disconnect');
    store.dispatch(clientDisconnectSelf(reason));
  });
  socket.on('action', (action) => {
    logger.silly('Client Recv:', action.type);
    if (serverToClient[action.type]) {
      const currentUserId = store.getState().getIn(['user', 'id']);
      //console.log('user', user);
      //action.user = user;
      store.dispatch(serverToClient[action.type](action.data, currentUserId));
    } else {
      logger.error('serverToClient action doesnt exist: ' + action.type);
    }
  });
  socket.on('error', (error) => {
    logger.error('Client:Error', error);
  });
};
