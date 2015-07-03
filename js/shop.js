/* global Hammer: true */
/* global angular: true */

'use strict';

angular.module('axsy.testshop.main', [])

.constant('CURRENCY_SYMBOL', '£')
.constant('CURRENCY_FRACTION_SIZE', 0)
.constant('DEFAULT_ITEMS_FETCH_LIMIT', 16)
.constant('ITEM_DRAG_SPEED_FACTOR', 0.2)
.constant('ITEM_DRAG_TRAVEL_UNITS', '5rem')
.constant('ITEM_SNAPBACK_DURATION_MS', 700)  // the duration of the snapback animation (in css)
.constant('INFINITE_SCROLL_ZONE_BOTTOM_OFFSET', 300)

.value('toPx', window.Length.toPx)
.value('requestAnimationFrame',
            window[Hammer.prefixed(window, 'requestAnimationFrame')])

// --- services ---

.factory('CatalogueService', [
    '$http',
    'DEFAULT_ITEMS_FETCH_LIMIT',
function($http, DEFAULT_ITEMS_FETCH_LIMIT) {
    var CATALOGUE_URL = './exercise/catalogue_items.json';
    return {
        fetchCatalogueItems: function(offset, limit) {
            if ( ! offset) {
                offset = 0;
            }
            if ( ! limit) {
                limit = DEFAULT_ITEMS_FETCH_LIMIT;
            }
            return $http
                .get(CATALOGUE_URL, { cache: true })
                .then(function(resp) {
                    return resp.data
                    .slice(offset, offset + limit)
                    .map(function(item) {
                        // set a default quantity for our "basket"
                        item._quantity = 0;
                        return item;
                    });
                });
        }
    };
}])

// --- controllers ---

.controller('StorefrontCtrl', [
    '$log',
    '$scope',
    'CatalogueService',
function($log, $scope, CatalogueService) {
    var itemsOffset = 0;

    $scope.catalogueItems = [];

    function fetchMoreItems(offset) {
        // default offset?
        if (offset === undefined) {
            offset = itemsOffset;
        }
        $scope.isLoading = true;
        return CatalogueService.fetchCatalogueItems(offset)
        .then(function(items) {
            // this looks like a hack,
            // but it's a way to add items to an array by reference
            $scope.isLoading = false;
            return items;
        });
    }

    function addItems(items) {
        return Array.prototype.push.apply($scope.catalogueItems, items);
    }

    function addItemsAndIncreaseOffset(items) {
        itemsOffset += items.length;
        return addItems(items);
    }

    // initial populate
    fetchMoreItems(itemsOffset).then(addItemsAndIncreaseOffset);

    $scope.loadMoreItems = function() {
        if ($scope.isLoading) {
            return;
        }
        $log.info('Loading more items', {offset: itemsOffset});
        return fetchMoreItems(itemsOffset).then(addItemsAndIncreaseOffset);
    };
}])

// --- directives ---

.directive('purchasableItem', [
    '$timeout',
    'toPx',
    'requestAnimationFrame',
    'ITEM_DRAG_TRAVEL_UNITS',
    'ITEM_DRAG_SPEED_FACTOR',
    'ITEM_SNAPBACK_DURATION_MS',
function($timeout, toPx, reqAnimationFrame, ITEM_DRAG_TRAVEL_UNITS, ITEM_DRAG_SPEED_FACTOR, ITEM_SNAPBACK_DURATION_MS) {
    return {
        require: 'ngModel',
        restrict: 'AC',
        transclude: true,
        template: '' +
            '<div class="purchasable-item-new-quantity-indicator left"></div>' +
            '<div ng-transclude></div>' +
            '<div class="purchasable-item-new-quantity-indicator right"></div>',
        controller: [
            '$scope',
            '$filter',
            'CURRENCY_SYMBOL',
            'CURRENCY_FRACTION_SIZE',
        function($scope, $filter, CURRENCY_SYMBOL, CURRENCY_FRACTION_SIZE) {
            var currencySymbol = CURRENCY_SYMBOL;
            // getItemImageStyle
            $scope.getItemImageStyle = function(item) {
                var cacheBusterParam = '?_cachebuster_' + item.uuid;
                return {
                    'background-image': 'url(http://lorempixel.com/64/64/'+cacheBusterParam+')'
                };
            };
            // getItemPrice
            $scope.getItemPrice = function(item) {
                var unitPrice = item.unit_price;
                // safari does not support Number.isNaN :(
                var isNaN = Number.isNaN || function(value) {
                    return typeof value === 'number' && value !== value;
                };
                if (isNaN(parseInt(unitPrice))) {
                    return 'n/a';
                }
                if (item.unit_price <= 0) {
                    return 'FREE';
                }
                var displayPrice =
                        $filter('currency')(unitPrice, currencySymbol, CURRENCY_FRACTION_SIZE);
                return displayPrice;
            };
        }],
        link: function(scope, elem, attrs, ngModel) {
            var _toPx = toPx.bind(this, elem);
            function getAdjustedQuantity(increment) {
                var adjustedQuantity = scope.getItemQuantity() + increment;
                return Math.max(0, adjustedQuantity);  // >= 0
            }
            // adjustItemQuantity: swiping changes the quantity via this function
            function adjustItemQuantity(increment) {
                var adjustedQuantity = getAdjustedQuantity(increment);
                elem.attr('data-quantity', adjustedQuantity);
                ngModel.$setViewValue(adjustedQuantity);
            }
            // getItemQuantity: return the _quantity attribute of the item
            scope.getItemQuantity = function() {
                return ngModel.$modelValue || 0;
            };
            // init quantity
            adjustItemQuantity(0);
            // --- //
            var maxX;
            var position = {
                maxX: maxX =  _toPx(ITEM_DRAG_TRAVEL_UNITS),
                minX: -maxX,
                curX: 0
            };
            var ticking = false;
            function updateElementPosition() {
                var translateX = 'translateX(' + position.curX + 'px)';
                elem[0].style.webkitTransform = translateX;
                elem[0].style.mozTransform = translateX;
                elem[0].style.transform = translateX;
                ticking = false;
            }
            function requestElementUpdate() {
                if ( ! ticking) {
                    reqAnimationFrame(updateElementPosition);
                    ticking = true;
                }
            }
            var mc = new Hammer.Manager(elem[0], {
                recognizers: [
                    // Hammer.Pan ref: http://hammerjs.github.io/recognizer-pan
                    [Hammer.Pan, {
                        direction: Hammer.DIRECTION_HORIZONTAL,
                        threshold: 5,
                        pointers: 0
                    }]
                ]
            });
            var swipeMutex = false;  // one swipe at a time
            var panning = false;
            function onPanMove(ev) {
                if (swipeMutex || ev.deltaY > 3) return;  // ignore Y pans
                var newX = position.curX + (ev.deltaX * ITEM_DRAG_SPEED_FACTOR);
                var curX = position.curX =
                        Math.min(Math.max(newX, position.minX), position.maxX);
                var travelCompletion = (Math.abs(curX) / position.maxX * 100) / 100;  // either direction
                var travelDirection  = curX < 0 ? 'left' : 'right';
                panning = true;
                scope.$broadcast('drag-position-changed', {
                    travelX: curX,
                    travelCompletion: travelCompletion,
                    travelDirection: travelDirection,
                    displayQuantity:
                            travelDirection === 'right' ? getAdjustedQuantity(1) : getAdjustedQuantity(-1)
                });
                requestElementUpdate();
            }
            function onPanEnd() {
                if (swipeMutex || ! panning) return;
                var curX = position.curX;
                var travelDirection  = curX < 0 ? 'left' : 'right';
                var quantityIncrement = travelDirection === 'right' ? 1 : -1;
                swipeMutex = true;  // lock further drags until reset
                panning = false;
                // hit right or left bound?
                if (curX <= position.minX + 10 || curX >= position.maxX - 10) {
                    adjustItemQuantity(quantityIncrement);
                }
                position.curX = 0;
                scope.$broadcast('drag-position-reset');
                requestElementUpdate();
                if (Math.abs(curX) < 20) {
                    // don't bother with animated snapback
                    swipeMutex = false;
                    return;
                }
                elem.addClass('snapping-back');
                $timeout(function() {
                    elem.removeClass('snapping-back');
                    swipeMutex = false;
                }, ITEM_SNAPBACK_DURATION_MS);
            }
            mc.on('panstart panmove', onPanMove);
            mc.on('panend', onPanEnd);
        }
    };
}])

.directive('purchasableItemNewQuantityIndicator', [
    'requestAnimationFrame',
function(reqAnimationFrame) {
    return {
        restrict: 'C',
        scope: true,
        template: '<span ng-bind="quantity"></span>',
        link: function(scope, elem) {
            var ticking = false;
            var position = { curX: 0 };
            var opacity = 0;
            function updateElementOpacityAndPosition() {
                var translateX = 'translateX(' + position.curX + 'px)';
                elem[0].style.opacity = opacity;
                elem[0].style.webkitTransform = translateX;
                elem[0].style.mozTransform = translateX;
                elem[0].style.transform = translateX;
                ticking = false;
            }
            function requestElementUpdate() {
                if ( ! ticking) {
                    reqAnimationFrame(updateElementOpacityAndPosition);
                    ticking = true;
                }
            }
            scope.$on('drag-position-reset', function() {
                opacity = 0;
                requestElementUpdate();
            });
            scope.$on('drag-position-changed', function(__ev, descriptor) {
                if ( ! elem.hasClass(descriptor.travelDirection)) {
                    // inverse x pos because of the way absolute positioning works (and fixed looks crap)
                    position.curX = -descriptor.travelX;
                    opacity = descriptor.travelCompletion;
                    scope.$apply(function(){
                        scope.quantity = descriptor.displayQuantity;
                    });
                } else {
                    // not us. opacity 0, pos 0.
                    opacity = 0;
                    position.curX = 0;
                }
                requestElementUpdate();
            });
        }
    };
}])

.directive('onInfiniteScroll', [
    '$document',
    '$window',
    'INFINITE_SCROLL_ZONE_BOTTOM_OFFSET',
function($document, $window, INFINITE_SCROLL_ZONE_BOTTOM_OFFSET) {
    function getDocumentHeight() {
        // from http://stackoverflow.com/a/1147768
        var body = $document[0].body,
            html = $document[0].documentElement;
        var height = Math.max( body.scrollHeight, body.offsetHeight,
                               html.clientHeight, html.scrollHeight, html.offsetHeight );
        return height;
    }
    return {
        restrict: 'A',
        link: function(scope, elem, attrs) {
            var $$window = angular.element($window);
            var mutex = false;
            function resetMutex() {
                mutex = false;
            }
            $$window.on('scroll', function(){
                if (mutex) return;
                // are we at the bottom of the page?
                if ($window.scrollY + $window.innerHeight >
                        getDocumentHeight() - INFINITE_SCROLL_ZONE_BOTTOM_OFFSET) {
                    mutex = true;
                    scope.$eval(attrs.onInfiniteScroll)
                    .then(resetMutex, resetMutex);
                }
            });
        }
    };
}]);

// --- int main() ---

angular.element(document).ready(function(){
    angular.bootstrap(document, ['axsy.testshop.main']);
});
