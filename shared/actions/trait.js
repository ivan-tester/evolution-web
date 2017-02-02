import logger from '~/shared/utils/logger';
import uuid from 'uuid';
import {ActionCheckError} from '~/shared/models/ActionCheckError';

import {
  TRAIT_TARGET_TYPE
  , TRAIT_COOLDOWN_DURATION
  , TRAIT_COOLDOWN_PLACE
  , TRAIT_COOLDOWN_LINK
} from '../models/game/evolution/constants';

import {server$game} from './generic';
import {doesPlayerHasOptions} from './ai';
import {server$gameEndTurn, server$addTurnTimeout, makeTurnTimeoutId} from './actions';

import {selectRoom, selectGame, selectPlayers4Sockets} from '../selectors';

import {PHASE, QuestionRecord} from '../models/game/GameModel';
import {TraitCarnivorous} from '../models/game/evolution/traitsData/index';
import {TraitCommunication, TraitCooperation} from '../models/game/evolution/traitTypes';

import {
  checkGameDefined
  , checkGameHasUser
  , checkGamePhase
  , checkPlayerHasAnimal
  , checkPlayerCanAct
  , checkPlayerTurn
} from './checks';

import {checkAnimalCanEat, checkTraitActivation} from './trait.checks';

import {addTimeout, cancelTimeout} from '../utils/reduxTimeout';

/**
 * Activation
 */

export const traitTakeFoodRequest = (animalId) => (dispatch, getState) => dispatch({
  type: 'traitTakeFoodRequest'
  , data: {gameId: getState().get('game').id, animalId}
  , meta: {server: true}
});

export const traitActivateRequest = (sourceAid, traitId, targetId) => (dispatch, getState) => dispatch({
  type: 'traitActivateRequest'
  , data: {gameId: getState().get('game').id, sourceAid, traitId, targetId}
  , meta: {server: true}
});

export const server$traitActivate = (game, sourceAnimal, trait, ...params) => (dispatch, getState) => {
  dispatch(server$traitNotify_Start(game, sourceAnimal, trait, ...params));
  const traitData = trait.getDataModel();
  logger.verbose('server$traitActivate:', sourceAnimal.id, trait.type);
  //dispatch()
  const result = dispatch(traitData.action(game, sourceAnimal, trait, ...params));
  logger.silly('server$traitActivate finish:', trait.type, result);
  return result;
};

/**
 * Cooldowns
 */

// Transport action
const startCooldown = (gameId, link, duration, place, placeId) => ({
  type: 'startCooldown'
  , data: {gameId, link, duration, place, placeId}
});

const traitMakeCooldownActions = (gameId, trait, sourceAnimal) => {
  const traitData = trait.getDataModel();
  if (!traitData.cooldowns) return []; //Protection against symbiosis
  return traitData.cooldowns.map(([link, place, duration]) => {
    const placeId = (place === TRAIT_COOLDOWN_PLACE.PLAYER ? sourceAnimal.ownerId
      : place === TRAIT_COOLDOWN_PLACE.TRAIT ? trait.id
      : sourceAnimal.id);
    return startCooldown(gameId, link, duration, place, placeId);
  }).toArray();
};

export const server$traitStartCooldown = (gameId, trait, sourceAnimal) => (dispatch) => {
  logger.debug('server$traitStartCooldown:', sourceAnimal.id, trait.type);
  traitMakeCooldownActions(gameId, trait, sourceAnimal)
    .map((cooldownAction) => dispatch(server$game(gameId, cooldownAction)));
};

/**
 * Local Traits
 */

const traitConvertFat = (gameId, sourceAid, traitId) => ({
  type: 'traitConvertFat'
  , data: {gameId, sourceAid, traitId}
});

export const server$traitConvertFat = (gameId, sourceAnimal, trait) =>
  server$game(gameId, traitConvertFat(gameId, sourceAnimal.id, trait.id));

const traitMoveFood = (gameId, animalId, amount, sourceType, sourceId) => ({
  type: 'traitMoveFood'
  , data: {gameId, animalId, amount, sourceType, sourceId}
});

const traitGrazeFood = (gameId, food, sourceAid) => ({
  type: 'traitGrazeFood'
  , data: {gameId, food, sourceAid}
});

export const server$traitGrazeFood = (gameId, food, sourceAnimal) =>
  server$game(gameId, traitGrazeFood(gameId, food, sourceAnimal.id));

const traitSetAnimalFlag = (gameId, sourceAid, flag, on) => ({
  type: 'traitSetAnimalFlag'
  , data: {gameId, sourceAid, flag, on}
});

export const server$traitSetAnimalFlag = (game, sourceAnimal, flag, on = true) =>
  server$game(game.id, traitSetAnimalFlag(game.id, sourceAnimal.id, flag, on));

const traitKillAnimal = (gameId, sourcePlayerId, sourceAnimalId, targetPlayerId, targetAnimalId) => ({
  type: 'traitKillAnimal'
  , data: {gameId, sourcePlayerId, sourceAnimalId, targetPlayerId, targetAnimalId}
});

export const server$traitKillAnimal = (gameId, sourceAnimal, targetAnimal) => (dispatch, getState) => dispatch(
  Object.assign(traitKillAnimal(gameId
    , sourceAnimal.ownerId, sourceAnimal.id
    , targetAnimal.ownerId, targetAnimal.id)
    , {meta: {users: selectPlayers4Sockets(getState, gameId)}}));

const traitAnimalRemoveTrait = (gameId, sourcePid, sourceAid, traitId) => ({
  type: 'traitAnimalRemoveTrait'
  , data: {gameId, sourcePid, sourceAid, traitId}
});

export const server$traitAnimalRemoveTrait = (gameId, sourceAnimal, traitId) =>
  server$game(gameId, traitAnimalRemoveTrait(gameId, sourceAnimal.ownerId, sourceAnimal.id, traitId));

/**
 *
 * */

const playerActed = (gameId, userId) => ({
  type: 'playerActed'
  , data: {gameId, userId}
});

export const server$playerActed = (gameId, userId) => (dispatch, getState) => {
  dispatch(server$game(gameId, playerActed(gameId, userId)));
  if (!doesPlayerHasOptions(selectGame(getState, gameId), userId))
    dispatch(server$gameEndTurn(gameId, userId));
};

/**
 * Notification
 */

const traitNotify_Start = (gameId, sourceAid, traitId, traitType, targetId) => ({
  type: 'traitNotify_Start'
  , data: {gameId, sourceAid, traitId, traitType, targetId}
});

const traitNotify_End = (gameId, sourceAid, traitId, traitType, targetId) => ({
  type: 'traitNotify_End'
  , data: {gameId, sourceAid, traitId, traitType, targetId}
});

export const server$traitNotify_Start = (game, sourceAnimal, trait, target) => {
  logger.debug('server$traitNotify_Start:', trait.type);
  return server$game(game.id, traitNotify_Start(game.id, sourceAnimal.id, trait.id, trait.type, target && target.id || target));
};

//TODO TRAIT
export const server$traitNotify_End = (gameId, sourceAid, trait, targetId) => {
  logger.debug('server$traitNotify_End:', trait.type);
  return server$game(gameId, traitNotify_End(gameId, sourceAid, trait.id, trait.type, targetId));
};

// complexActions

export const server$startFeeding = (gameId, animal, amount, sourceType, sourceId) => (dispatch, getState) => {
  logger.debug(`server$startFeeding: ${sourceId} feeds ${animal.id} through ${sourceType}`);
  if (!animal.canEat(selectGame(getState, gameId))) return false;

  // TODO bug with 2 amount on animal 2/3
  dispatch(server$game(gameId, traitMoveFood(gameId, animal.id, amount, sourceType, sourceId)));

  const game = selectGame(getState, gameId);
  // Cooperation
  if (sourceType === 'GAME' && game.food > 0) {
    animal.traits.filter(trait => trait.type === TraitCooperation && trait.checkAction(game, animal))
      .forEach(traitCooperation => {
        const {animal: linkedAnimal} = game.locateAnimal(traitCooperation.linkAnimalId);

        if (selectGame(getState, gameId).food <= 0) return; // Re-check food after each cooperation

        animal.traits.filter(t => t.linkAnimalId === linkedAnimal.id) // Get all paired traits that link to Linked Animal
          .concat(linkedAnimal.traits.filter(t => t.linkAnimalId === animal.id)) // And get all paired traits that link from Linked Animal to this
          .map(trait => traitMakeCooldownActions(gameId, trait)) // A-a-and...
          .reduce((result, arrayOfCooldownActions) => result.concat(arrayOfCooldownActions), [])
          .forEach(cooldownAction => dispatch(cooldownAction)); // Put them all in a cooldown.

        dispatch(server$traitNotify_Start(game, animal, traitCooperation, linkedAnimal));
        dispatch(server$startFeeding(gameId, linkedAnimal, 1, 'GAME', animal.id));
      });
  }

  // Communication
  animal.traits.filter(traitCommunication => traitCommunication.type === TraitCommunication
    && traitCommunication.checkAction(selectGame(getState, gameId), animal))
    .map(traitCommunication => {
      const {animal: linkedAnimal} = game.locateAnimal(traitCommunication.linkAnimalId);
      const linkedTrait = linkedAnimal.traits.find(trait => trait.id === traitCommunication.linkId);

      traitMakeCooldownActions(gameId, traitCommunication, animal)
        .concat(traitMakeCooldownActions(gameId, linkedTrait, linkedAnimal))
        .map(cooldownAction => dispatch(cooldownAction));

      dispatch(server$traitNotify_Start(game, animal, traitCommunication, linkedAnimal));
      dispatch(server$startFeeding(gameId, linkedAnimal, 1, 'TraitCommunication', animal.id));
    });
  return true;
};

// Defence

export const traitDefenceQuestion = (gameId, question) => ({
  type: 'traitDefenceQuestion'
  , data: {gameId, question}
});

const makeTraitDefenceQuestionTimeout = (gameId, questionId) => `traitDefenceQuestion#${gameId}#${questionId}`;

export const server$traitDefenceQuestion = (gameId, attackAnimal, trait, defenceAnimal, defaultDefence) => (dispatch, getState) => {
  const questionId = uuid.v4();
  const game = selectGame(getState, gameId);

  const timeTraitResponse = game.settings.timeTraitResponse;
  const turnRemainingTime = dispatch(cancelTimeout(makeTurnTimeoutId(gameId))) || 0;
  const turnUserId = game.players.find(p => p.index === game.status.currentPlayer).id;

  const question = QuestionRecord.new(questionId, attackAnimal, trait.id, defenceAnimal, turnUserId, turnRemainingTime);

  logger.verbose('server$traitDefenceQuestion', question.toJS());
  // Notify all users
  dispatch(Object.assign(traitDefenceQuestion(gameId, question.set('id', null))
    , {meta: {clientOnly: true, users: selectPlayers4Sockets(getState, gameId)}}));
  // Add timeout to response
  dispatch(addTimeout(timeTraitResponse
    , makeTraitDefenceQuestionTimeout(gameId, questionId)
    , defaultDefence(questionId)));
  // Notify defending user
  dispatch(Object.assign(traitDefenceQuestion(gameId, question)
    , {meta: {userId: defenceAnimal.ownerId}}));
};

export const traitDefenceAnswerRequest = (traitId, targetId) => (dispatch, getState) => dispatch({
  type: 'traitDefenceAnswerRequest'
  , data: {gameId: getState().get('game').id, questionId: getState().getIn(['game', 'question', 'id']), traitId, targetId}
  , meta: {server: true}
});

export const traitDefenceAnswerSuccess = (gameId, questionId) => ({
  type: 'traitDefenceAnswerSuccess'
  , data: {gameId, questionId}
});

export const server$traitDefenceAnswerSuccess = (gameId, questionId) => (dispatch, getState) => {
  const question = selectGame(getState, gameId).question;
  if (question) {
    dispatch(cancelTimeout(makeTraitDefenceQuestionTimeout(gameId, questionId)));
    dispatch(server$game(gameId, traitDefenceAnswerSuccess(gameId, questionId)));
    if (question.turnUserId)
      dispatch(server$addTurnTimeout(gameId, question.turnUserId, question.turnRemainingTime));
  }
};

export const server$traitDefenceAnswer = (gameId, questionId, traitId, targetId) => (dispatch, getState) => {
  logger.debug('server$traitDefenceAnswer', questionId, traitId, targetId);
  const game = selectGame(getState, gameId);
  if (!game.get('question')) {
    throw new ActionCheckError(`server$traitDefenceAnswer@Game(${game.id})`
      , 'Game doesnt have Question(%s)', questionId)
  }
  const question = game.get('question');
  if (question.id !== questionId) {
    throw new ActionCheckError(`server$traitDefenceAnswer@Game(${game.id})`
      , 'QuesionID is incorrect (%s)', questionId)
  }
  const {sourceAnimal: attackAnimal, trait: attackTrait} =
    checkTraitActivation(game, question.sourcePid, question.sourceAid, question.traitId, question.targetAid);

  const {sourceAnimal: defenceAnimal, trait: defenceTrait, target} =
    checkTraitActivation(game, question.targetPid, question.targetAid, traitId, targetId);

  dispatch(server$traitDefenceAnswerSuccess(game.id, questionId));
  const result = dispatch(server$traitActivate(game, defenceAnimal, defenceTrait, target, attackAnimal, attackTrait));
  logger.debug('server$traitDefenceAnswer result:', attackTrait.type, defenceTrait.type, result);
  if (result) dispatch(server$playerActed(gameId, attackAnimal.ownerId));
  return result;
};

//

export const traitClientToServer = {
  traitTakeFoodRequest: ({gameId, animalId}, {userId}) => (dispatch, getState) => {
    const game = selectGame(getState, gameId);
    checkGameDefined(game);
    checkGameHasUser(game, userId);
    checkGamePhase(game, PHASE.FEEDING);
    checkPlayerCanAct(game, userId);
    const animal = checkPlayerHasAnimal(game, userId, animalId);
    checkAnimalCanEat(game, animal);

    logger.debug('traitTakeFoodRequest:', userId, animalId);

    dispatch(server$game(gameId, startCooldown(gameId, TRAIT_COOLDOWN_LINK.EATING, TRAIT_COOLDOWN_DURATION.ROUND, TRAIT_COOLDOWN_PLACE.PLAYER, userId)));
    dispatch(server$game(gameId, startCooldown(gameId, 'TraitCarnivorous', TRAIT_COOLDOWN_DURATION.ROUND, TRAIT_COOLDOWN_PLACE.PLAYER, userId)));

    dispatch(server$startFeeding(gameId, animal, 1, 'GAME'));
    dispatch(server$playerActed(gameId, userId));
  }
  , traitActivateRequest: ({gameId, sourceAid, traitId, targetId}, {userId}) => (dispatch, getState) => {
    const game = selectGame(getState, gameId);
    checkGameDefined(game);
    checkGamePhase(game, PHASE.FEEDING);
    checkPlayerCanAct(game, userId);
    const {sourceAnimal, trait, target} = checkTraitActivation(game, userId, sourceAid, traitId, targetId);
    const result = dispatch(server$traitActivate(game, sourceAnimal, trait, target));
    if (result === void 0) {
      throw new Error(`traitActivateRequest@Game(${gameId}): Animal(${sourceAid})-${trait.type}-Animal(${targetId}) result undefined`);
    }
    //logger.silly('traitActivateRequest: ' + result);
    if (result) {
      dispatch(server$playerActed(gameId, userId));
    }
  }
  , traitDefenceAnswerRequest: ({gameId, questionId, traitId, targetId}, {userId}) => (dispatch, getState) => {
    const game = selectGame(getState, gameId);
    checkGameDefined(game);
    checkGamePhase(game, PHASE.FEEDING);

    const {sourcePid, targetPid} = game.question;
    checkPlayerTurn(game, sourcePid);
    if (userId !== targetPid) {
      throw new ActionCheckError(`checkPlayerCanAct@Game(${game.id})`
        , `Player(%s) acting on Target(%s) answering`
        , userId, targetPid);
    }

    dispatch(server$traitDefenceAnswer(gameId, questionId, traitId, targetId));
  }
};

export const traitServerToClient = {
  traitMoveFood: ({gameId, animalId, amount, sourceType, sourceId}) =>
    traitMoveFood(gameId, animalId, amount, sourceType, sourceId)
  , startCooldown: ({gameId, link, duration, place, placeId}) =>
    startCooldown(gameId, link, duration, place, placeId)
  , traitKillAnimal: ({gameId, sourcePlayerId, sourceAnimalId, targetPlayerId, targetAnimalId}) =>
    traitKillAnimal(gameId, sourcePlayerId, sourceAnimalId, targetPlayerId, targetAnimalId)
  , playerActed: ({gameId, userId}) =>
    playerActed(gameId, userId)
  , traitDefenceQuestion: ({gameId, question}, currentUserId) =>
    traitDefenceQuestion(gameId, QuestionRecord.fromJS(question))
  , traitDefenceAnswerSuccess: ({gameId, questionId}, currentUserId) =>
    traitDefenceAnswerSuccess(gameId, questionId)
  , traitNotify_Start: ({gameId, sourceAid, traitId, traitType, targetId}, currentUserId) =>
    traitNotify_Start(gameId, sourceAid, traitId, traitType, targetId)
  , traitNotify_End: ({gameId, sourceAid, traitId, traitType, targetId}, currentUserId) =>
    traitNotify_End(gameId, sourceAid, traitId, traitType, targetId)
  , traitAnimalRemoveTrait: ({gameId, sourcePid, sourceAid, traitId}) =>
    traitAnimalRemoveTrait(gameId, sourcePid, sourceAid, traitId)
  , traitGrazeFood: ({gameId, food, sourceAid}) => traitGrazeFood(gameId, food, sourceAid)
  , traitConvertFat: ({gameId, sourceAid, traitId}) => traitConvertFat(gameId, sourceAid, traitId)
  , traitSetAnimalFlag: ({gameId, sourceAid, flag, on}) =>
    traitSetAnimalFlag(gameId, sourceAid, flag, on)
};