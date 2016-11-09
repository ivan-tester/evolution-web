import logger from '~/shared/utils/logger';
import {fromJS} from 'immutable';
import {TRAIT_TARGET_TYPE
  , TRAIT_COOLDOWN_DURATION
  , TRAIT_COOLDOWN_PLACE
  , TRAIT_COOLDOWN_LINK
  , FOOD_SOURCE_TYPE
  , TRAIT_RESPONSE_TIMEOUT} from '../constants';
import {
  server$traitKillAnimal
  , server$startFeeding
  , server$startCooldown
  , server$traitActivate
  , server$traitStartCooldown
  , server$traitDefenceQuestion
  , server$traitDefenceAnswer
} from '../../../../actions/actions';
import {addTimeout} from '../../../../utils/reduxTimeout';

import {GameModel} from '../../GameModel';
import {TraitDataModel} from '../TraitDataModel';
import {TraitMimicry
  , TraitRunning
  , TraitScavenger
  , TraitSymbiosis
  , TraitTailLoss} from './index';

export const TraitCarnivorous = {
  type: 'TraitCarnivorous'
  , food: 1
  , targetType: TRAIT_TARGET_TYPE.ANIMAL
  , checkTraitPlacement: (animal) => !animal.hasTrait('TraitScavenger')
  , cooldowns: fromJS([
    ['TraitCarnivorous', TRAIT_COOLDOWN_PLACE.ANIMAL, TRAIT_COOLDOWN_DURATION.TURN]
    , [TRAIT_COOLDOWN_LINK.EATING, TRAIT_COOLDOWN_PLACE.PLAYER, TRAIT_COOLDOWN_DURATION.ROUND]
  ])
  , action: (game, sourceAnimal, targetAnimal) => (dispatch, getState) => {
    let killed = true, acted = true, cooldown = true;
    let needToAskTargetUser = false;
    let traitMimicry, traitTailLoss;

    // Check for running and get data for defence options
    !targetAnimal.traits.some((trait) => {
      if (trait.type === TraitRunning.type) {
        if (dispatch(TraitRunning.action(game, targetAnimal, sourceAnimal))) {
          killed = false;
          return true;
        }
      } else if (trait.type === TraitMimicry.type && TraitDataModel.checkAction(game, TraitMimicry, targetAnimal)) {
        traitMimicry = game.getPlayer(targetAnimal.ownerId).continent.filter((animal) =>
          targetAnimal.id !== animal.id
          && TraitCarnivorous.checkTarget(game, sourceAnimal, animal)
        );
        if (traitMimicry.size === 0) {
          traitMimicry = void 0;
        } else if (traitMimicry.size === 1) {
        } else {
          needToAskTargetUser = true;
        }
      } else if (trait.type === TraitTailLoss.type && TraitDataModel.checkAction(game, TraitTailLoss, targetAnimal)) {
        traitTailLoss = targetAnimal.traits;
        if (traitTailLoss.size === 0) {
          traitTailLoss = void 0;
        } else if (traitTailLoss.size === 1) {
        } else {
          needToAskTargetUser = true;
        }
      }
    });

    // Check for running and get data for defence options
    if (killed) {
      const attackParameter = {
        sourcePid: sourceAnimal.ownerId
        , sourceAid: sourceAnimal.id
        , traitType: TraitCarnivorous.type
        , targetPid: targetAnimal.ownerId
        , targetAid: targetAnimal.id
      };

      const defaultDefence = (dispatch) => {
        if (traitTailLoss) {
          dispatch(server$traitDefenceAnswer(game.id
            , attackParameter
            , {
              traitType: TraitTailLoss.type
              , targetIndex: traitTailLoss.size - 1
            }
          ));
          killed = false;
        } else if (traitMimicry) {
          dispatch(server$traitDefenceAnswer(game.id
            , attackParameter
            , {
              traitType: TraitMimicry.type
              , targetPid: traitMimicry.get(0).ownerId
              , targetAid: traitMimicry.get(0).id
            }
          ));
          acted = false;
          killed = false;
          cooldown = false;
        }
      };

      if (needToAskTargetUser) {
        dispatch(addTimeout(TRAIT_RESPONSE_TIMEOUT, 'traitAnswer' + game.id, defaultDefence));
        dispatch(server$traitDefenceQuestion(game.id, attackParameter));
        acted = true;
        killed = false;
        cooldown = false;
      } else {
        defaultDefence(dispatch);
      }
    }

    if (cooldown) {
      dispatch(server$traitStartCooldown(game.id, TraitCarnivorous, sourceAnimal));
    }

    if (killed) {
      dispatch(server$traitKillAnimal(game.id, sourceAnimal, targetAnimal));

      // Scavenge
      dispatch(server$startFeeding(game.id, sourceAnimal, 2, FOOD_SOURCE_TYPE.ANIMAL_HUNT, targetAnimal.id));

      const currentPlayerIndex = game.getPlayer(sourceAnimal.ownerId).index;
      GameModel.sortPlayersFromIndex(game, currentPlayerIndex).some(player => player.continent.some(animal => {
        const traitScavenger = animal.hasTrait(TraitScavenger.type);
        if (traitScavenger && animal.canEat(game) > 0) {
          dispatch(server$startFeeding(game.id, animal, 1));
          return true;
        }
      }));
    }
    logger.silly('TraitCarnivorous:', sourceAnimal, targetAnimal, killed, acted);
    return acted;
  }
  , $checkAction: (game, sourceAnimal) => {
    return sourceAnimal.canEat(game)
  }
  , checkTarget: (game, sourceAnimal, targetAnimal) => (
    (sourceAnimal.hasTrait('TraitSharpVision') || !targetAnimal.hasTrait('TraitCamouflage'))
    && (!targetAnimal.traits.some(trait => trait.type === 'TraitSymbiosis' && trait.symbioticAid === targetAnimal.id))
    && (sourceAnimal.hasTrait('TraitMassive') || !targetAnimal.hasTrait('TraitMassive'))
    && !(targetAnimal.canSurvive() && targetAnimal.hasTrait('TraitBurrowing'))
    && (
      (sourceAnimal.hasTrait('TraitSwimming') && targetAnimal.hasTrait('TraitSwimming'))
      || (!sourceAnimal.hasTrait('TraitSwimming') && !targetAnimal.hasTrait('TraitSwimming'))
    )
  )
};